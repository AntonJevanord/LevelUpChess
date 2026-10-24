"""Offline anchor comparison; never launches an engine or changes its values."""
import argparse, hashlib, json, pathlib, platform
import numpy as np
import scipy
from scipy.optimize import minimize
from scipy.special import expit

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory', type=pathlib.Path, help='Existing material collection report directory')
parser.add_argument('--out', required=True, type=pathlib.Path, help='New JSON output file')
args = parser.parse_args()
if args.out.exists(): parser.error('--out must be a new file')
DIR = args.directory
meta_bytes = (DIR / 'material-dataset.json').read_bytes()
sample_bytes = (DIR / 'material-samples.jsonl').read_bytes()
meta = json.loads(meta_bytes)
rows = [json.loads(line) for line in sample_bytes.decode().splitlines() if line]
report_bytes = (DIR / 'material-collection-report.json').read_bytes()
primary = json.loads(report_bytes)
RIDGE = .001

def fit(X, y, w, names, anchored):
    mean = np.average(X, axis=0, weights=w)
    scales = np.sqrt(np.average((X-mean)**2, axis=0, weights=w))
    scales = np.where(scales > 1e-15, scales, 1.)
    Z = np.column_stack([np.ones(len(X)), (X-mean)/scales])
    d = Z.shape[1]
    if anchored:
        p, q = names.index('pawn')+1, names.index('queen')+1
        columns = [j for j in range(d) if j != q]
        A = np.zeros((d, d-1))
        for j, original in enumerate(columns): A[original, j] = 1.
        A[q, columns.index(p)] = 9*scales[q-1]/scales[p-1]
    else:
        A = np.eye(d)
    transformed = Z@A
    def objective(free):
        b = A@free
        eta = transformed@free
        loss = np.dot(w, np.logaddexp(0, eta)-y*eta)/w.sum() + RIDGE*np.dot(b[1:], b[1:])/2
        grad = transformed.T@(w*(expit(eta)-y))/w.sum() + RIDGE*A[1:].T@b[1:]
        return loss, grad
    result = minimize(objective, np.zeros(A.shape[1]), method='L-BFGS-B', jac=True,
                      options=dict(maxiter=1000, ftol=1e-14, gtol=1e-10))
    b = A@result.x
    coefficients = b[1:]/scales
    if anchored and coefficients[names.index('pawn')] <= 1e-6:
        raise ValueError('The anchored fit does not support a positive material-to-score scale.')
    return dict(converged=bool(result.success), coefficients=coefficients,
                intercept=float(b[0]-np.dot(coefficients, mean)))

def metrics(y, p, w):
    p = np.clip(p, 1e-12, 1-1e-12)
    return dict(brier=float(np.average((p-y)**2, weights=w)),
                logLoss=float(np.average(-(y*np.log(p)+(1-y)*np.log1p(-p)), weights=w)))

results = []
for cohort in ['ordinary', 'combined']:
    ids = {g['gameId'] for g in meta['games'] if cohort == 'combined' or g['kind'] == 'ordinary'}
    names = [n for n in meta['featureNames'] if cohort == 'combined' or not n.startswith('bonus:')]
    indices = [meta['featureNames'].index(n) for n in names]
    selected = [r for r in rows if r['gameId'] in ids]
    X = np.asarray([[r['x'][i] for i in indices] for r in selected], float)
    y = np.asarray([r['y'] for r in selected]); w = np.asarray([r['weight'] for r in selected])
    groups = np.asarray([r['groupId'] for r in selected])
    for anchored in [False, True]:
        model = fit(X, y, w, names, anchored)
        if not anchored:
            expected = np.asarray([primary['analysis'][cohort]['fit']['coefficients'][n] for n in names])
            assert np.max(abs(model['coefficients']-expected)) < 1e-4, (cohort, model['coefficients'], expected)
        coefficient = dict(zip(names, model['coefficients'].tolist()))
        if anchored: assert abs(coefficient['queen']-9*coefficient['pawn']) < 1e-8
        predictions = np.zeros(len(y)); folds = []
        for group in sorted(set(groups)):
            test = groups == group
            fold = fit(X[~test], y[~test], w[~test], names, anchored)
            predictions[test] = expit(X[test]@fold['coefficients']+fold['intercept'])
            folds.append(dict(group=group, converged=fold['converged'], **metrics(y[test], predictions[test], w[test])))
        value = dict(cohort=cohort, model='pawn-1-queen-9-assumed' if anchored else 'unconstrained',
                     games=len(ids), samples=len(selected), groups=len(set(groups)),
                     converged=model['converged'], allHoldoutsConverged=all(f['converged'] for f in folds),
                     coefficients=coefficient, pawnNormalized={n:c/coefficient['pawn'] for n,c in coefficient.items()},
                     heldOutMetrics=metrics(y, predictions, w), folds=folds)
        results.append(value)

sha = lambda value: hashlib.sha256(value).hexdigest()
output = dict(schemaVersion=1, runId=meta['identity']['runId'], engineGamesStarted=0,
              inputs=dict(datasetSha256=sha(meta_bytes), samplesSha256=sha(sample_bytes),
                          primaryReportSha256=sha(report_bytes),
                          analysisSourceSha256=sha(pathlib.Path(__file__).read_bytes())),
              runtime=dict(python=platform.python_version(), numpy=np.__version__, scipy=scipy.__version__),
              method=dict(anchor='beta_queen = 9 * beta_pawn; score scale and intercept remain fitted',
                          ridge=RIDGE, penalty='Same original-feature standardized slope penalty for both models; constrain through linear parameter map',
                          weighting='Unit total sample weight per game; draws retained',
                          validation='Leave one selected book-position cluster out; all three conditions stay together',
                          baselineCheck='Independent unconstrained coefficients match frozen Node report within 1e-4'),
              limits=['Pawn=1 and queen=9 are assumed anchors, not measured ratios.',
                      'Point fits and held-out diagnostics only; no uncertainty intervals for constrained values.',
                      'Thirty-two selected positions may share opening ancestry; no significance or generalization claim.',
                      'Same outcomes reused for model comparison; this is exploratory and needs an untouched future validation set.'],
              results=results)
args.out.parent.mkdir(parents=True, exist_ok=True)
with args.out.open('x', encoding='utf-8', newline='\n') as stream:
    stream.write(json.dumps(output, indent=2)+'\n')
print(json.dumps([{k:v for k,v in r.items() if k not in ['folds','coefficients']} for r in results],indent=2))

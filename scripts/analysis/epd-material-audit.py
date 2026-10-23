#!/usr/bin/env python3
"""Independent, offline EPD material analysis; never imports uploaded code or engines."""
import argparse, hashlib, json, re, sys, platform
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np
import scipy
import sklearn
from scipy.optimize import minimize
from scipy.special import expit
from sklearn.linear_model import LogisticRegression

NAMES=['P','N','B','R','Q','K']
FEATURES=['pawn','knight','bishop','rook','queen','tempo']
RIDGE=.001
SCORE={'1-0':1.,'1/2-1/2':.5,'0-1':0.}

def validate_fen(fields, line):
    if len(fields)!=6 or fields[1] not in ('w','b'):
        raise ValueError(f'Line {line}: expected an ordinary six-field FEN')
    ranks=fields[0].split('/')
    if len(ranks)!=8:
        raise ValueError(f'Line {line}: expected eight ranks')
    for rank in ranks:
        if not rank or any(c not in '12345678PNBRQKpnbrqk' for c in rank):
            raise ValueError(f'Line {line}: unsupported board or piece encoding')
        if sum(int(c) if c.isdigit() else 1 for c in rank)!=8:
            raise ValueError(f'Line {line}: each rank must contain eight squares')
    if fields[0].count('K')!=1 or fields[0].count('k')!=1:
        raise ValueError(f'Line {line}: exactly one ordinary king per side is required')
    if fields[2]!='-' and (any(c not in 'KQkq' for c in fields[2]) or len(set(fields[2]))!=len(fields[2])):
        raise ValueError(f'Line {line}: invalid castling rights')
    if fields[3]!='-' and not re.fullmatch('[a-h][36]',fields[3]):
        raise ValueError(f'Line {line}: invalid en passant field')
    if not fields[4].isdigit() or not fields[5].isdigit() or int(fields[5])<1:
        raise ValueError(f'Line {line}: invalid move counters')

def load(file):
    raw=Path(file).read_bytes(); rows=[]; errors=[]
    for num,line in enumerate(raw.decode('utf-8-sig').splitlines(),1):
        if not line.strip(): continue
        parts=line.split(';'); fields=parts[0].strip().split()
        ann={}
        for part in parts[1:]:
            tok=part.strip().split(None,1)
            if tok:
                if tok[0] in ann: raise ValueError(f'Line {num}: repeated annotation {tok[0]}')
                ann[tok[0]]=tok[1] if len(tok)>1 else ''
        validate_fen(fields,num)
        if ann.get('result') not in SCORE or not ann.get('game') or ann.get('variant','chess')!='chess':
            errors.append(num);continue
        pieces=re.findall('[a-zA-Z]',fields[0]); counts=Counter(pieces)
        diff=[counts[n]-counts[n.lower()] for n in NAMES]
        hm=int(ann.get('hmvc') or fields[-2]); result=SCORE[ann['result']]
        if hm<0: raise ValueError(f'Line {num}: negative material-stability counter')
        rows.append(dict(line=num,fen=parts[0].strip(),game=ann['game'],result=ann['result'],y=result,
                         hm=hm,turn=fields[1],x=diff[:5]+[1 if fields[1]=='w' else -1],
                         original_x=[v*(-1 if fields[1]=='b' else 1) for v in diff],
                         original_y=1-result if fields[1]=='b' else result,pieces=len(pieces)))
    if errors: raise ValueError(f'{file}: malformed lines {errors[:10]}')
    outcomes=defaultdict(set)
    for r in rows: outcomes[r['game']].add(r['result'])
    if any(len(v)!=1 for v in outcomes.values()):raise ValueError('Conflicting game labels')
    return rows,dict(file=Path(file).name,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),rows=len(rows),games=len(outcomes),
                      gameResults=dict(Counter(next(iter(v)) for v in outcomes.values())),rowResults=dict(Counter(r['result'] for r in rows)))

def reproduce(rows):
    eligible=[r for r in rows if r['hm']>=1 and r['y']!=.5]
    X=np.asarray([r['original_x'] for r in eligible]);y=np.asarray([r['original_y'] for r in eligible])
    if len(set(y))<2: raise ValueError('Reference reproduction needs stable decisive positions with both side-to-move labels')
    model=LogisticRegression(solver='liblinear',C=10.,random_state=0).fit(X,y)
    coef=model.coef_[0];norm=min(abs(v) for v in coef if v>.05)
    return dict(rows=len(eligible),games=len(set(r['game'] for r in eligible)),rawCoefficients=dict(zip(NAMES,coef.tolist())),
                normalizedValues=dict(zip(NAMES,(coef/norm).tolist())),move=float(model.intercept_[0]/norm),normalizer=float(norm),
                queenMinusRook=float((coef[4]-coef[3])/norm),settings=dict(solver='liblinear',C=10,draws='excluded',stablePly=1,normalization='minimum positive coefficient >.05'))

def prepare(rows):
    eligible=[r for r in rows if r['hm']>=1]
    groups=sorted(set(r['game'] for r in eligible));counts=Counter(r['game'] for r in eligible)
    X=np.asarray([r['x'] for r in eligible],float); y=np.asarray([r['y'] for r in eligible],float)
    index={g:i for i,g in enumerate(groups)}
    w=np.asarray([1/counts[r['game']] for r in eligible]); gid=np.asarray([index[r['game']] for r in eligible])
    return eligible,groups,X,y,w,gid

def fit(X,y,w):
    weight=w.sum();mean=np.average(X,axis=0,weights=w); scale=np.sqrt(np.average((X-mean)**2,axis=0,weights=w));scale=np.where(scale>1e-15,scale,1.)
    Z=np.column_stack([np.ones(len(X)),(X-mean)/scale])
    def objective(b):
        eta=Z@b;p=expit(eta)
        loss=np.dot(w,np.logaddexp(0,eta)-y*eta)/weight+RIDGE*np.dot(b[1:],b[1:])/2
        grad=Z.T@(w*(p-y))/weight;grad[1:]+=RIDGE*b[1:]
        return loss,grad
    res=minimize(objective,np.zeros(X.shape[1]+1),method='L-BFGS-B',jac=True,options=dict(maxiter=100,ftol=1e-12,gtol=1e-8))
    coef=res.x[1:]/scale; intercept=res.x[0]-np.dot(coef,mean)
    return coef,float(intercept),bool(res.success),int(res.nit)

def metrics(y,p,w):
    p=np.clip(p,1e-12,1-1e-12)
    return dict(brier=float(np.average((p-y)**2,weights=w)),logLoss=float(np.average(-(y*np.log(p)+(1-y)*np.log1p(-p)),weights=w)))

def corrected(rows, bootstrap=100,seed=42):
    rr,groups,X,y,w,gid=prepare(rows);coef,intercept,ok,nit=fit(X,y,w)
    # Fixed five folds by stable SHA-256 of game ID. One game's rows always stay together.
    folds=np.asarray([int(hashlib.sha256(g.encode()).hexdigest()[:8],16)%5 for g in groups]); pred=np.zeros(len(y));base=np.zeros(len(y));fold_results=[]
    if len(set(folds))<2: raise ValueError('Game-held-out validation needs at least two occupied folds')
    for k in sorted(set(folds)):
        mask=folds[gid]==k
        c,b,success,it=fit(X[~mask],y[~mask],w[~mask]);pred[mask]=expit(X[mask]@c+b);base[mask]=np.average(y[~mask],weights=w[~mask])
        fold_results.append(dict(fold=k,trainingGames=int(np.sum(folds!=k)),testGames=int(np.sum(folds==k)),converged=success))
    rng=np.random.default_rng(seed);values=[];failed=0;bad_pawn=0
    for i in range(bootstrap):
        multiplicity=np.bincount(rng.integers(len(groups),size=len(groups)),minlength=len(groups));weights=w*multiplicity[gid]
        c,b,success,it=fit(X,y,weights)
        if not success:failed+=1;continue
        if c[0]<=1e-6:bad_pawn+=1;continue
        values.append(c/c[0])
        if (i+1)%20==0:print(f'Bootstrap {i+1}/{bootstrap}',file=sys.stderr,flush=True)
    a=np.asarray(values)
    return dict(method=dict(target='expected final White score, W/D/L=1/.5/0',weighting='equal total weight per game',link='fractional logistic',ridge=RIDGE,intercept='unpenalized',features=FEATURES,stablePly=1,validation='five deterministic game-held-out folds',bootstrap='whole game IDs; recompute pawn-normalized ratio per replicate',seed=seed),
                rows=len(rr),games=len(groups),drawGames=len(set(r['game'] for r in rr if r['y']==.5)),converged=ok,iterations=nit,
                coefficients=dict(zip(FEATURES,coef.tolist())),intercept=intercept,
                arithmeticRatios=dict(zip(FEATURES,(coef/coef[0]).tolist())) if coef[0]>1e-6 else None,
                trainMetrics=metrics(y,expit(X@coef+intercept),w),validationMetrics=metrics(y,pred,w),baselineMetrics=metrics(y,base,w),folds=fold_results,
                bootstrap=dict(unit='whole game ID',confidence=.95,requested=bootstrap,completed=len(values),failed=failed,nonpositivePawn=bad_pawn,
                               ratios={n:dict(lower=float(np.quantile(a[:,j],.025)),upper=float(np.quantile(a[:,j],.975)),std=float(np.std(a[:,j],ddof=1))) for j,n in enumerate(FEATURES)} if len(values)>1 else {}),
                limits=['Original engine/source identity and per-row search settings were not supplied.','Game IDs prevent within-game leakage, but shared opening families and repeated physical games may still correlate different game IDs.','Material-only fitted coefficients are contextual outcome predictions, not causal exchange prices or raw engine evaluation units.','This sensitivity model changes weights, draw treatment, parameterization and regularization; differences from the reference fit do not isolate one cause.','The supplied hmvc annotation is used as a material-stability counter; full move legality and tactical quietness are not replay-verified.'])

def reference_game_bootstrap(rows, count=100, seed=42):
    rr=[r for r in rows if r['hm']>=1 and r['y']!=.5]
    groups=sorted(set(r['game'] for r in rr)); index={g:i for i,g in enumerate(groups)}
    X=np.asarray([r['original_x'] for r in rr]);y=np.asarray([r['original_y'] for r in rr]);gid=np.asarray([index[r['game']] for r in rr])
    rng=np.random.default_rng(seed);values=[];failed=0;failed_fits=0
    for i in range(count):
        mult=np.bincount(rng.integers(len(groups),size=len(groups)),minlength=len(groups))
        weights=mult[gid]
        if len(set(y[weights>0]))<2:
            failed_fits+=1;continue
        try:
            model=LogisticRegression(solver='liblinear',C=10.,random_state=0).fit(X,y,sample_weight=weights)
        except ValueError:
            failed_fits+=1;continue
        c=model.coef_[0]
        if c[0]<=1e-6:failed+=1;continue
        values.append(c/c[0])
    a=np.asarray(values)
    return dict(unit='whole game ID',confidence=.95,draws='excluded exactly as reference point fit',weighting='original position weights retained within each sampled game',
                games=len(groups),requested=count,completed=len(values),failedFits=failed_fits,nonpositivePawn=failed,seed=seed,
                normalization='explicit pawn coefficient re-estimated in each replicate',
                ratios={n:dict(lower=float(np.quantile(a[:,j],.025)),upper=float(np.quantile(a[:,j],.975)),std=float(np.std(a[:,j],ddof=1))) for j,n in enumerate(NAMES)} if len(values)>1 else {},
                queenMinusRook=dict(lower=float(np.quantile(a[:,4]-a[:,3],.025)),upper=float(np.quantile(a[:,4]-a[:,3],.975)),std=float(np.std(a[:,4]-a[:,3],ddof=1))) if len(values)>1 else {})

def main():
    p=argparse.ArgumentParser(description='Offline ordinary-chess EPD reproduction and methodology sensitivity; never runs an engine.')
    p.add_argument('file');p.add_argument('--bootstrap',type=int,default=100);p.add_argument('--seed',type=int,default=42);p.add_argument('--out',required=True);args=p.parse_args()
    if not 0<=args.bootstrap<=1000: p.error('--bootstrap must be between 0 and 1000')
    if not 0<=args.seed<=0xffffffff: p.error('--seed must be an unsigned 32-bit integer')
    output=Path(args.out)
    if output.exists(): p.error('--out must be a new file; existing output is never replaced')
    rows,meta=load(args.file);original=reproduce(rows)
    original['gameBootstrap']=reference_game_bootstrap(rows,args.bootstrap,args.seed)
    print(json.dumps(dict(input=meta,reproduction=original),indent=2),flush=True)
    adjusted=corrected(rows,args.bootstrap,args.seed)
    result=dict(schemaVersion=1,format='independent-epd-material-fit-audit',engineGamesStarted=0,
                runtime=dict(python=platform.python_version(),numpy=np.__version__,scipy=scipy.__version__,sklearn=sklearn.__version__),
                analysisSourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                input=meta,reproduction=original,gameWeightedScoreFit=adjusted)
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('x',encoding='utf-8',newline='\n') as stream: stream.write(json.dumps(result,indent=2)+'\n')
    print(json.dumps(adjusted,indent=2),flush=True)
if __name__=='__main__': main()

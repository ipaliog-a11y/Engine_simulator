import re,sys,statistics as st
t=open(sys.argv[1],encoding='utf8').read().splitlines()
A=re.compile(r'^\s*(\d{4})\s+(.+?)\s+(\S+)\s+(\S+)\s+(\w\w)\s+(\d+)\s+(\d+)\s+([FR4])\s+(\d\.\d{3})\s+(\d\.\d{3})\s+(\d\.\d{3})\s+(\d\.\d{2})\s+(\d+)\s')
B=re.compile(r'^\s*(\d{4})\s+(.+?)\s+(\S+)\s+(\S+)\s+(\w\w)\s+(\d+)\s+(\d+)\s+([FR4])\s+(\d\.\d{3})\s+(\d\.\d{3}|N/A)\s')
a={};b={}
for l in t:
  m=A.match(l)
  if m: a[(m[1],m[2].split()[0],m[3],m[6],m[7])]=dict(type=m[5],occ=int(m[6]),bal=int(m[7]),tf=float(m[10]),tr=float(m[11]),roof=float(m[12]),name=m[1]+' '+m[2]); continue
  m=B.match(l)
  if m and m[10]!='N/A': b[(m[1],m[2].split()[0],m[3],m[6],m[7])]=float(m[10])
cars={'2S','4S','3H','5H','2C','4W','5W','2H','4H','CV','SW'}
rows=[(k,a[k],b[k]) for k in a if k in b]
print('joined',len(rows),'of A',len(a),'B',len(b)); print('types',sorted({r[1]['type'] for r in rows}))
for lab,f in [('all, unladen (occ<=1, no ballast)',lambda d:d['occ']<=1 and d['bal']==0),('cars, unladen',lambda d:d['occ']<=1 and d['bal']==0 and d['type'] in cars),('trucks/SUV/van, unladen',lambda d:d['occ']<=1 and d['bal']==0 and d['type'] not in cars),('cars, 0 occupants',lambda d:d['occ']==0 and d['bal']==0 and d['type'] in cars)]:
  r=[h/d['roof'] for k,d,h in rows if f(d)]
  if r: print(f"{lab}: n={len(r)} median={st.median(r):.4f} mean={st.mean(r):.4f} sd={st.pstdev(r):.4f} min={min(r):.3f} max={max(r):.3f} q1={st.quantiles(r,n=4)[0]:.3f} q3={st.quantiles(r,n=4)[2]:.3f}")

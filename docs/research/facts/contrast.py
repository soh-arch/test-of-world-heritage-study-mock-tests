def lum(h):
    h=h.lstrip('#'); c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda v: v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4
    r,g,b=[f(v) for v in c]
    return 0.2126*r+0.7152*g+0.0722*b
def cr(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb)
    return (hi+0.05)/(lo+0.05)
bg={'bg':'#F7F3ED','surface':'#FFFEFB','bg-sunken':'#F0ECE4'}
fg={'text':'#231E16','text-muted':'#534C41','text-faint':'#736D62',
    'indigo-text':'#316A89','indigo-solid':'#22759E','indigo-graphic':'#22759E',
    'celadon-text':'#486E44','celadon-solid':'#4F794A','celadon-graphic':'#648F5F',
    'ochre-text':'#845C32','ochre-solid':'#9B621B','ochre-graphic':'#7E4A01',
    'bengara-text':'#8E554B','bengara-solid':'#AB5649','bengara-graphic':'#9F4A3E'}
print(f"{'foreground':<18}"+''.join(f"{k:>12}" for k in bg))
for fk,fv in fg.items():
    row=''.join(f"{cr(fv,bv):>12.2f}" for bv in bg.values())
    print(f"{fk:<18}"+row)
print()
print("white #FFFEFB on solid backgrounds:")
for k in ['indigo-solid','celadon-solid','ochre-solid','bengara-solid']:
    print(f"  {k:<16} {cr(fg[k],'#FFFEFB'):.2f}")

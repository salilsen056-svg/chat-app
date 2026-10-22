export function cropRect(width,height,zoom=1,x=0.5,y=0.5){
 const size=Math.min(width,height)/Math.max(1,Math.min(3,zoom));
 return {sx:(width-size)*Math.max(0,Math.min(1,x)),sy:(height-size)*Math.max(0,Math.min(1,y)),size};
}

const app = {routes:[]}; for (const m of ['use','get','post','put','delete','patch']) app[m]=(...a)=>{app.routes.push([m,a[0]]);return app;};
app.listen=(p,cb)=>{cb&&cb();return {unref(){}};}; app.locals={};
function express(){return app;} express.json=()=>()=>{}; express.static=()=>()=>{}; module.exports=express;

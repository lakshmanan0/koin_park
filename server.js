const express=require('express');
const registerRoutes=require('./Routes/registerRoutes')
const cron = require('node-cron');

const app=express();
app.use(express.json());

app.use('/api',registerRoutes)

cron.schedule('0 0 * * *', async () => {
    console.log("Running daily returns process...");
    await stakingController.processReturns();
    console.log("Daily returns processed successfully.");
});

const PORT=8081;

app.listen(PORT,()=>{
    console.log(`server is running posrt->${PORT}`);
    
})
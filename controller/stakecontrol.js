const db=require('../model/db')


exports.stakingg=async(req,res)=>{
   try{
      console.log("good")
   const{user_id,cur_id,plan_id,amount}=req.body;

   await db.query("SELECT duration, percentage FROM plans WHERE plan_id = ?", [plan_id],async(err,plan)=>{
      if (!plan) return res.status(400).json({ message: "Invalid plan" });

      console.log("plan",plan);
      
   
   

   let qurrr="select balance from wallet where user_id=?"
   await db.query(qurrr,[user_id],async(err,resul)=>{
      console.log("resul",resul)
     if(err || resul.length===0){
        res.json({status:0,responseCode:921,error:err.message,message:"user have no wallet"})
       return res.end()
     }

     else{
      console.log("JSON.parse(resul[0])",resul[0].balance)
        let amttt=resul[0].balance

        console.log("amttt[cur_id].amt>=amount",amttt[cur_id].amt>=amount)

        if( amttt[cur_id].amt < amount){
           res.json({status:0,responseCode:456,message:"insufficient balanace ur wallet while stakingg"})
           return res.end()
        }
        else{
         const start_date = new Date();
         const end_date = new Date();
         end_date.setMonth(start_date.getMonth() + plan[0].duration);

         const yearly_interest = (amount * plan[0].percentage) / 100;
         console.log("yearly_interest",yearly_interest);
         
         const daily_interest = yearly_interest / 365;
         console.log("daily_interest",daily_interest);
         
       
    let sqll="insert into staking_history (user_id,cur_id,plan_id,stake_amt,return_perday,start_date,end_date,status) values(?,?,?,?,?,?,?,1)"
    await db.query(sqll,[user_id,cur_id,plan_id,amount,daily_interest ,start_date,end_date],async(err,stakeins)=>{
      if(err){
         res.json({status:0,responseCode:981,error:err.message})
         return res.end()
      }
      else{

         let sqlll="select referral_status from users where id=?  "
         await db.query(sqlll,[user_id],async(err,refests)=>{
            if(err){
               res.json({status:0,responseCode:378,error:err.message})
               return res.end()
            }
            else{

               console.log("refests",refests)
               for(let i=0;i<refests.length;i++){

                  let level=i+1;
              let sss="select percentage from level_bonus where level=?"
              await db.query(sss,[level],async(err,percentage)=>{
                if(err){
                  res.json({status:0,responseCode:810,error:err.message})
                  return res.end()
                }
                else{
                  let bonus=(percentage/amount)/100;
                    let id=refests[1];
                  let quuu="select balance from wallet where user_id=?"
                  await db.query(quuu,[id],async(err,ress)=>{
                      if(err){
                        res.json({status:0,responseCode:568,error:err.message})
                        return res.end()
                      }
                      else{
                        let balance=ress[0].balance;
                        if(balance[1]){
                           balance[1].amt+=bonus
                        }
                      }
                  })
                }
              })
               }
            }
         })



        
      }
    })

        }
     }
   })
})
   }catch(error){
     res.json({status:0,error:error.message})
     return res.end()
   }

}
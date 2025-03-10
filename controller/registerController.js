const db=require('../model/db')
const Validator=require('node-input-validator')


exports.registerUser=async(req,res)=>{
try{
    console.log(req.body);
    
    const {userName,email,password,phoneNumber,countryCode,referral_id}=req.body;
//    const  v=new Validator(req.body,{
//     userName:"require",
//     email:"required",
//     password:"required",
//     phoneNumber:"required",
//     countryCode:"required" 
//    })

//    const matched=await v.check()
//    console.log("matched",matched);
   
//     if(!matched){
//         return res.json({status:0,error:v.errors})
//     }
   

   let sql="select * from country_code where counntryCode=? ;select * from users where phoneNumber=? ";
   await db.query(sql,[countryCode,phoneNumber],async(err,resull)=>{
    console.log("err",err);
    
    console.log("resull",resull);
    
    if(resull[0].length ===0){
        res.json({status:0,responseCode:456,message:"invalid country code"})
        return res.end()
    }
    if(resull[1].length >0){
        res.json({status:0,responseCode:456,message:" phone number already registeredd"})
        return res.end()
    }
   // const hashedPassword = await bcrypt.hash(password, 10);
   
   })
   let referralChain = [];
    if(referral_id){
         // Get referrer's details
         const referrerQuery = "SELECT id, referral_status FROM users WHERE id = ?";
         db.query(referrerQuery, [referral_id], async (err, referrerResult) => {

            console.log("referrerResult",referrerResult);
            
            console.log("err",err);
            
             if (err) return res.status(500).json({ error: "Database error" });
             if (referrerResult.length === 0) return res.status(400).json({ error: "Invalid referral ID" });
          let reffres=referrerResult[0]. referral_status
           

             referralChain.push(referral_id,...reffres);


             const insertUserQuery = `
             INSERT INTO users (userName, email, password, phoneNumber, countryCode, referral_status, currentRefferal) 
             VALUES (?, ?, ?, ?, ?, ?, ?)
         `;
         db.query(insertUserQuery, 
             [userName, email, password, phoneNumber, countryCode, JSON.stringify(referralChain), referral_id], 
           async  (err, result) => {
                 if (err){ 
                    return res.status(500).json({ error: "Database error" });
                 }
                
                 else{
                    let user_id= result.insertId;
                    let amtt='{"1": {"amt":0,"sym":" " }}'
                    let querr="insert into wallet (user_id,balance) values(?,?)"
                    await db.query(querr,[user_id,amtt],async(err,resull)=>{
                         if(err){
                            res.json({status:0,responseCode:820,error:err.message})
                            return res.end()
                         }
                         else{
                            res.status(201).json({ message: "User registered successfully", userId: result.insertId });
                            return res.end()
                         }
                    })
                 }
                 
               

                
             }
         );
               
            })
    }

    else {
        // Insert new user without referral
        const insertUserQuery = `
            INSERT INTO users (userName, email, password, phoneNumber, countryCode, referral_status, currentRefferal) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        db.query(insertUserQuery, 
            [userName, email,password, phoneNumber, countryCode, JSON.stringify([]), 0], 
            (err, result) => {
                if (err) return res.status(500).json({ error: "Database error" });

              return  res.status(201).json({ message: " registered without referral----", userId: result.insertId });
            }
        );
    }
} catch (error) {
   return  res.status(500).json({ error: "Server error" });
}
    
   
}






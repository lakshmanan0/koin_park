const express=require('express')
let router=express.Router()
const registerController=require('../controller/registerController')
const depositControl=require('../controller/depositControl')
const stakeControl=require('../controller/stakecontrol')
const userControl=require('../controller/userControl')

router.post('/register',registerController.registerUser)
router.post('/deposit',depositControl.deposit)


router.post('/staking',stakeControl.stakingg)


router.post('/returns',userControl.returnUser)
module.exports=router
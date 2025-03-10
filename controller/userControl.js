// const Staking = require('../models/stakingModel');
// const Wallet = require('../models/walletModel');

const db=require('../model/db')

exports.returnUser = async () => {
    try {
        let sqll = "SELECT * FROM staking_history WHERE status = 1";
        await db.query(sqll, async (err, activeUsers) => {
            if (err) {
                console.error("Error fetching active staking users:", err.message);
                return;
            }

            console.log("activeUsers", activeUsers);

            for (const user of activeUsers) {
                console.log("Processing user:", user.user_id);

                let xyz = "SELECT balance FROM wallet WHERE user_id = ?";
                await db.query(xyz, [user.user_id], async (err, resll) => {
                    if (err) {
                        console.error("Error fetching wallet balance:", err.message);
                        return;
                    }

                    if (resll.length === 0 || !resll[0].balance) {
                        console.error("No balance found for user:", user.user_id);
                        return;
                    }

                    let balance = resll[0].balance;

                    // Validate if balance is a valid JSON string
                    try {
                        let parsedBalance = JSON.parse(balance);
                        if (!Array.isArray(parsedBalance)) {
                            console.error("Invalid balance format for user:", user.user_id);
                            return;
                        }

                        // Update the balance
                        if (parsedBalance[1]) {
                            parsedBalance[1].amt += user.returns_per_day;
                        }

                        let updatedBalance = JSON.stringify(parsedBalance);
                        let upda = "UPDATE wallet SET balance = ? WHERE user_id = ?";
                        await db.query(upda, [updatedBalance, user.user_id], (err, updatewal) => {
                            if (err) {
                                console.error("Error updating wallet balance:", err.message);
                                return;
                            }
                            console.log("Wallet balance updated for user:", user.user_id);
                        });
                    } catch (jsonError) {
                        console.error("Invalid JSON in balance field for user:", user.user_id, jsonError);
                        return;
                    }
                });
            }
        });
    } catch (err) {
        console.error("Error processing returns:", err);
    }
};
const db = require("../model/db");

exports.deposit = async (req, res) => {
    try {
        const { user_id, cur_id, symbol, depamt } = req.body;
        console.log("User ID:", user_id);

        // if (!user_id || !cur_id || !symbol || !depamt) {
        //     res.json({ status: 0, responseCode: 567, message: "Invalid data" });
        //     return res.end();
        // }

        var sqll = "SELECT balance FROM wallet WHERE user_id=?";
        await db.query(sqll, [user_id], async (err, result) => {
            console.log("Balance Raw Data:", JSON.stringify(result));
            console.log("Error:", err);

            if (err || result.length === 0) {
                res.json({ status: 0, responseCode: 982, message: "Invalid data" });
                return res.end();
            }

            let amttt = result[0].balance;

            // ✅ Check if balance is a string before parsing
            if (typeof amttt === "string") {
                try {
                    amttt = JSON.parse(amttt);
                } catch (e) {
                    console.error("JSON Parse Error:", e);
                    res.json({ status: 0, responseCode: 983, message: "Invalid JSON format in DB" });
                    return res.end();
                }
            }

            console.log("Parsed Balance:", JSON.stringify(amttt, null, 2));

            // ✅ Correct JSON update
            if (amttt[cur_id]) {
                amttt[cur_id].amt += depamt;
            } else {
                amttt[cur_id] = { amt: depamt, sym: symbol }; // ✅ Store as object, not string
            }

            console.log("Updated Balance:", JSON.stringify(amttt, null, 2));

            let query = "UPDATE wallet SET balance = ? WHERE user_id = ?";
            await db.query(query, [JSON.stringify(amttt), user_id], async (updateErr) => {
                if (updateErr) {
                    console.error("Update Error:", updateErr);
                    res.json({ status: 0, responseCode: 923, error: updateErr.message });
                } else {
                    res.json({ status: 1, responseCode: 567, message: "Deposit to wallet successful" });
                }
                return res.end();
            });
        });
    } catch (error) {
        res.json({ status: 0, responseCode: 981, error: error.message });
        return res.end();
    }
};





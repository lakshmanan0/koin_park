



const db = require('../model/db')

exports.searchUsers = async (req, res) => {
    try {
        let { username, email, phone, amount, start_date, end_date } = req.query;
        let conditions = [];
        let values = [];

        if (name) {
            conditions.push("name LIKE ?");
            values.push(`%${name}%`);
        }
        if (email) {
            conditions.push("email LIKE ?");
            values.push(`%${email}%`);
        }
        if (phone) {
            conditions.push("phone LIKE ?");
            values.push(`%${phone}%`);
        }
        if (amount) {
            conditions.push("amount = ?");
            values.push(amount);
        }
        if (start_date && end_date) {
            conditions.push("created_at BETWEEN ? AND ?");
            values.push(start_date, end_date);
        }

        let sql = "SELECT * FROM users1";
        if (conditions.length > 0) {
            sql += " WHERE " + conditions.join(" AND ");
        }

        db.query(sql, values, (err, results) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(results);
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
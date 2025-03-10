const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'lakshmanan@123',
    database: 'koinpark',
    dateStrings: true,
    multipleStatements: true
});

exports.query = async (sql, values, callback) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Database connection error:', err);
            return callback(err, null);
        }

        connection.query(sql, values, (err, result, fields) => {
            connection.release();

            if (err) {
                console.error('Query execution error:', err);
                return callback(err, null);
            }

            return callback(null, result);
        });
    });
};

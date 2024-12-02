const express = require('express');
const oracledb = require('oracledb');
const cors = require('cors'); // Import CORS
require('dotenv').config();
const app = express();

app.use(cors()); // Enable CORS

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECTION_STRING
};

app.get('/ticket/:ticketNumber', async (req, res) => {
    const ticketNumber = req.params.ticketNumber;
    let connection;

    try {
        connection = await oracledb.getConnection(dbConfig);

        const query = `
            SELECT 
                t.passenger_id,
                t.flight_id,
                t.seating_class,
                f.departure_date,
                f.arrival_date,
                f.origin AS origin_code,
                origin_loc.locationDesc AS origin_airport,
                f.destination AS destination_code,
                destination_loc.locationDesc AS destination_airport,
                a.airplane_name AS airplane,
                a.company AS airline
            FROM ticket t
            JOIN flight f ON t.flight_id = f.flight_id
            JOIN location origin_loc ON f.origin = origin_loc.locationCode
            JOIN location destination_loc ON f.destination = destination_loc.locationCode
            JOIN airplane a ON f.airplane_id = a.airplane_id
            WHERE t.passenger_id = :ticketNumber
        `;

        const result = await connection.execute(
            query,
            [ticketNumber],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            res.status(404).json({ message: 'No ticket found for the provided passenger ID' });
        } else {
            // Format date and time separately
            const formattedData = result.rows.map(row => ({
                ...row,
                departure_date: new Date(row.DEPARTURE_DATE).toISOString().split('T')[0],
                departure_time: new Date(row.DEPARTURE_DATE).toTimeString().split(' ')[0],
                arrival_date: new Date(row.ARRIVAL_DATE).toISOString().split('T')[0],
                arrival_time: new Date(row.ARRIVAL_DATE).toTimeString().split(' ')[0],
            }));

            res.json(formattedData);
        }
    } catch (err) {
        console.error('Database query error:', err);
        res.status(500).send('Error retrieving ticket details');
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error('Error closing the database connection:', err);
            }
        }
    }
});
app.get('/departures', async (req, res) => {
    let connection;

    try {
        connection = await oracledb.getConnection(dbConfig);

        // SQL query to fetch departure details with separate date and time
        const query = `
            SELECT 
                f.flight_id,
                TO_CHAR(f.departure_date, 'YYYY-MM-DD') AS departure_date,  -- Extract date
                TO_CHAR(f.departure_date, 'HH24:MI:SS') AS departure_time,  -- Extract time
                f.origin,
                f.destination,
                a.company AS airline
            FROM flight f
            JOIN airplane a ON f.airplane_id = a.airplane_id
        `;

        // Execute query
        const result = await connection.execute(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        // Return the results as JSON
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching departure details:', err);
        res.status(500).json({ error: 'Failed to fetch departure details' });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error('Error closing the database connection:', err);
            }
        }
    }
});
app.get('/flight-duration', async (req, res) => {
    const fromLocation = req.query.from;
    const toLocation = req.query.to;

    if (!fromLocation || !toLocation) {
        return res.status(400).json({ error: 'Please provide both "from" and "to" locations' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection(dbConfig);

        // SQL query to call the GET_FLIGHT_TIME function with case-insensitive parameters
        const query = `
            SELECT GET_FLIGHT_TIME(
                UPPER(:fromLocation),
                UPPER(:toLocation)
            ) AS flight_duration
            FROM dual
        `;

        const result = await connection.execute(query, {
            fromLocation: fromLocation.toUpperCase(), // Ensure input is uppercased
            toLocation: toLocation.toUpperCase() // Ensure input is uppercased
        }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        if (result.rows.length === 0 || result.rows[0].FLIGHT_DURATION === null) {
            return res.status(404).json({ error: 'No flight duration found for the given locations' });
        }

        res.json({ duration: result.rows[0].FLIGHT_DURATION });
    } catch (err) {
        console.error('Error fetching flight duration:', err);
        res.status(500).json({ error: 'An error occurred while fetching the flight duration' });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error('Error closing the database connection:', err);
            }
        }
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
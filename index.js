const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yarpj5v.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized Access' });
    }

    const token = authHeader.split(' ')[1];
    console.log(token);
}

const run = async () => {
    try {
        const appointmentOptionCollection = client.db("neuro-care").collection("appointment-options");
        const bookingCollection = client.db("neuro-care").collection("bookings");
        const userCollection = client.db("neuro-care").collection("users");

        app.get('/appointmentOptions', async (req, res) => {
            const query = {};
            const date = req.query.date;
            const bookingQuery = { appointmentDate: date };

            const options = await appointmentOptionCollection.find(query).toArray();
            const alreadyBooked = await bookingCollection.find(bookingQuery).toArray();
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name)
                // console.log(optionBooked);
                const bookedSlots = optionBooked.map(booked => booked.slot);
                // console.log(bookedSlots);
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
                // console.log(remainingSlots);
                option.slots = remainingSlots;
            })
            res.send(options);
        });

        app.get('/v2/appointmentOptions', async (req, res) => {
            const date = req.query.date;

            const options = await appointmentOptionCollection.aggregate([
                {
                    $lookup:
                    {
                        from: 'bookings',
                        localField: 'name',
                        foreignField: 'treatment',
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ['$appointmentDate', date]
                                    }
                                }
                            }
                        ],
                        as: 'booked'
                    }
                },
                {
                    $project: {
                        name: 1,
                        slots: 1,
                        booked: {
                            $map:
                            {
                                input: "$booked",
                                as: "book",
                                in: '$$book.slot'
                            }
                        }
                    }
                },
                {
                    $project: {
                        name: 1,
                        slots: {
                            $setDifference: ['$slots', '$booked']
                        }
                    }
                }
            ]).toArray();

            res.send(options);

        });

        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const query = {
                email: email
            };
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings);
        });

        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            // console.log(booking);
            const query = {
                email: booking?.email,
                appointmentDate: booking?.appointmentDate,
                treatment: booking?.treatment
            }
            // console.log(query);
            const alreadyBooked = await bookingCollection.find(query).toArray();

            if (alreadyBooked.length) {
                const message = `You already have a booking on ${booking.appointmentDate}`;
                return res.send({ acknowledged: false, message });
            }

            const result = await bookingCollection.insertOne(booking);
            res.send(result);
        });

        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '30D' });
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' });
        });

        app.post('/users', async (req, res) => {
            const user = req.body;

            const result = await userCollection.insertOne(user);
            res.send(result);
        });

    }
    finally {

    }
};

run().catch(console.dir);

app.get('/', async (req, res) => {
    res.send('Neuro Care Server Running');
})

app.listen(port, () => {
    console.log('Neuro Care Server Running on port:', port);
})
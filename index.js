const express = require('express');
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('doctors portal is running')
})



const uri = `mongodb+srv://${process.env.SECRET_USER}:${process.env.SECRET_PASSWORD}@cluster1.m4sihj5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

function verifyJWT(req, res, next) {

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('unauthorized access');
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.JSON_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    })

}

async function run() {
    try {
        const doctorsPortalCollection = client.db('doctorsPortal').collection('DentalServices')
        const treatmentCollection = client.db('doctorsPortal').collection('TreatmentServices')
        const usersCollection = client.db('doctorsPortal').collection('usersServices')
        const doctorsCollection = client.db('doctorsPortal').collection('doctors')


        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query)
            if (user?.role !== 'Admin') {
                return res.status(403).send({ message: 'Forbidden User' })
            }
            next();
        }

        app.get('/dentalServices', async (req, res) => {
            const date = req.query.date;
            console.log(date)
            const query = {};
            const options = await doctorsPortalCollection.find(query).toArray();
            const bookingQuery = { appointmentDate: date };
            const alreadytBooked = await treatmentCollection.find(bookingQuery).toArray();
            options.forEach(option => {
                const serviceBooked = alreadytBooked.filter(book => book.selectedTreatment === option.name);

                const bookedSlots = serviceBooked.map(book => book.slot);
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
                option.slots = remainingSlots;
                // console.log(date, option.name, remainingSlots.length);
            })

            res.send(options);
        })

        // app.get('/v4/dentalServices', async (req, res) => {
        //     const date = req.query.date;
        //     const options = await doctorsPortalCollection.aggregate([
        //         {
        //             $lookup: {
        //                 from: 'TreatmentServices',
        //                 localField: 'name',
        //                 foreignField: 'selectedTreatment',
        //                 pipeline: [
        //                     {
        //                         $match: {
        //                             $expr: {
        //                                 $eq: ['appointmentDate', date]
        //                             }
        //                         }
        //                     }
        //                 ],
        //                 as: 'booked'
        //             }
        //         },
        //         {
        //             $project: {
        //                 name: 1,
        //                 slots: 1,
        //                 booked: {
        //                     $map: {
        //                         input: '$booked',
        //                         as: 'book',
        //                         in: '$$book.slot'
        //                     }
        //                 }

        //             }
        //         },
        //         {
        //             $project: {
        //                 name: 1,
        //                 slots: {
        //                     $setDifference: ['$slots', '$booked']
        //                 }
        //             }
        //         }

        //     ]).toArray();
        //     res.send(options)
        // })


        // ______API Naming Convention_______
        // app.get('/bookings', (req, res))
        // app.get('/bookings/:id', (req, res))
        // app.post('/bookings', (req, res))
        // app.patch('/bookings/:id', (req, res))
        // app.delete('/bookings/:id', (req, res))

        app.get('/specially', async (req, res) => {
            const query = {};
            const result = await doctorsPortalCollection.find(query).project({ name: 1 }).toArray();
            res.send(result);

        })

        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query?.email;
            const decodedEmail = req.decoded?.email;
            if (decodedEmail?.toLowerCase() !== email?.toLowerCase()) {
                res.status(403).send({ message: 'Forbidden Access' })
            }

            const query = { email: email?.toLowerCase() };
            const bookings = await treatmentCollection.find(query).toArray();
            res.send(bookings);
        })


        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = {
                appointmentDate: booking.appointmentDate,
                selectedTreatment: booking.selectedTreatment,
                email: booking.email
            }
            const alreadyBooked = await treatmentCollection.find(query).toArray();

            if (alreadyBooked.length) {
                const message = `You already have an appointment on ${booking.appointmentDate}`
                return res.send({ acknowledged: false, message });
            }

            const result = await treatmentCollection.insertOne(booking);
            res.send(result);
        });

        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.JSON_TOKEN, { expiresIn: '1h' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' })
        });

        app.get('/users', async (req, res) => {
            const query = {}
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result)
        })

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            res.send({ isAdmin: user?.role === 'Admin' });
        })

        app.put('/users/admin/id/:id', verifyJWT, verifyAdmin, async (req, res) => {

            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: 'Admin'
                }
            };
            const result = await usersCollection.updateOne(filter, updatedDoc, options)
            res.send(result);
        })

        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {};
            const doctors = await doctorsCollection.find(query).toArray();
            res.send(doctors);
        })

        app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor)
            res.send(result);
        })

        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await doctorsCollection.deleteOne(query)
            res.send(result);
        })


    }
    finally {

    }
}
run().catch(console.dir);


app.listen(port, () => console.log(`doctors portal is running on port ${port}`))
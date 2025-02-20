//necessary packages
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const io = require('socket.io')(4545, {
    cors: {
        origin: 'http://localhost:3000',
        credentials: true,
    }
});

//config files 
require("./config/db");
require("dotenv").config();

//models
const User = require("./models/user.model");
const Conversation = require("./models/conversation.model");
const Message = require("./models/message.model");
const MessagesByA = require("./models/messageByA");

//encryption
const saltRounds = 10;

const app = express();

app.use(cors());
app.use(express.urlencoded({extended : true}));
app.use(express.json());

//socket things
let users = [];
io.on('connection', socket => {
    console.log('User connected', socket.id);
    socket.on('addUser', userId => {
        const isUserExist = users.find(user => user.userId === userId);
        if (!isUserExist) {
            const user = { userId, socketId: socket.id };
            users.push(user);
            io.emit('getUsers', users);
        }
    });

    socket.on('sendMessage', async ({ senderId, receiverId, message, conversationId }) => {
        const receiver = users.find(user => user.userId === receiverId);
        const sender = users.find(user => user.userId === senderId);
        const user = await User.findById(senderId);
        console.log('sender :>> ', sender, receiver);
        if (receiver) {
            io.to(receiver.socketId).to(sender.socketId).emit('getMessage', {
                senderId,
                message,
                conversationId,
                receiverId,
                user: {
                    id: user._id,
                    username: user.username,
                    phone: user.phone
                }
            });
            }else {
                io.to(sender.socketId).emit('getMessage', {
                    senderId,
                    message,
                    conversationId,
                    receiverId,
                    user: {
                        id: user._id,
                        username: user.username,
                        phone: user.phone
                    }
                });
            }
        });

    socket.on('disconnect', () => {
        users = users.filter(user => user.socketId !== socket.id);
        io.emit('getUsers', users);
    });
    // io.emit('getUsers', socket.userId);
});

//testing home route
app.get("/", (req,res) => {
    res.send("sussy baka ekhane kisu nai")
});

//plant details
const plantRouter = require('./routes/plant');
app.use('/plants', plantRouter);


//register route
app.post("/register", async (req,res) =>{
    try {
        const user = await User.findOne({phone : req.body.phone});
        if(user) res.status(400).send("user already exists");
        const hash = await new Promise((resolve, reject) => {
            bcrypt.hash(req.body.password, saltRounds, function(err,hash){
                if(err) reject(err);
                resolve(hash);
            });
        });

        const newUser = new User({
            username: req.body.username,
            phone: req.body.phone,
            password: hash
        });

        const savedUser = await newUser.save();
        res.send({
            success: true,
            message: "User successsfully created"
        });
    } catch(error) {
        res.send({message: "Couldn't create user!", error: error});
    }
});


//new login
app.post('/login', async (req, res, next) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            res.status(400).send('Please fill all required fields');
        } else {
            const user = await User.findOne({ phone });
            if (!user) {
                res.status(400).send('User phone or password is incorrect');
            } else {
                const validateUser = await bcrypt.compare(password, user.password);
                if (!validateUser) {
                    res.status(400).send('User phone or password is incorrect');
                } else {
                    const payload = {
                        userId: user._id,
                        phone: user.phone
                    }
                    const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'PLACEHOLDER_SECRET_KEY';

                    jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: 84600 }, async (err, token) => {
                        await User.updateOne({ _id: user._id }, {
                            $set: { token }
                        })
                        user.save();
                        return res.status(200).json({
                            user: {
                                id: user._id,
                                phone: user.phone,
                                username: user.username,
                                isExpert: user.isExpert
                            }, token: token
                        })
                    })
                }
            }
        }

    } catch (error) {
        console.log(error, 'Error')
    }
})

//create a convo
app.post('/conversation', async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;
    const newConversation = new Conversation({ members: [senderId, receiverId] });
    await newConversation.save();
    console.log(newConversation, 'newConversation');
    res.status(200).send('Conversation created successfully');
  } catch (error) {
    console.log(error, 'Error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

//get list of convo in which current user is involved
app.get('/conversation/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        console.log(userId, 'userId');
        const conversations = await Conversation.find({ members: { $in: [userId] } });
        const conversationUserData = Promise.all(conversations.map(async (conversation) => {
            const receiverId = conversation.members.find((member) => member !== userId);
            const user = await User.findById(receiverId);
            return {
                user: {
                    receiverId: user._id,
                    phone: user.phone,
                    username: user.username
                }, conversationId: conversation._id
            }
        }))
        res.status(200).json(await conversationUserData);
    } catch (error) {
        console.log(error, 'Error')
    }
})

//send message
app.post('/message', async (req, res) => {
    try {
        const { conversationId, senderId, message, receiverId} = req.body;
        if (!senderId || !message)
            return res.status(400).send('Please fill all required fields')
        if (conversationId === 'new' && receiverId) {
            const newCoversation = new Conversation({ members: [senderId, receiverId] });
            await newCoversation.save();
            const newMessage = new Message({ conversationId: newCoversation._id, senderId, message });
            await newMessage.save();
            return res.status(200).send('Message sent successfully');
        } else if (!conversationId && !receiverId) {
            return res.status(400).send('Please fill all required fields')
        }
        const newMessage = new Message({ conversationId, senderId, message });
        await newMessage.save();
        res.status(200).send('Message sent successfully');
    } catch (error) {
        console.log(error, 'Error')
    }
})

//get messages in a convo
app.get('/message/:conversationId', async (req, res) => {
    try {
        const checkMessages = async (conversationId) => {
            console.log(conversationId, 'conversationId')
            const messages = await Message.find({ conversationId });
            const messageUserData = Promise.all(messages.map(async (message) => {
                const user = await User.findById(message.senderId);
                return {
                    user: {
                        id: user._id,
                        phone: user.phone,
                        username: user.username
                    }, message: message.message
                }
            }));
            res.status(200).json(await messageUserData);
        }
        const conversationId = req.params.conversationId;
        if (conversationId === 'new') {
            const checkConversation = await Conversations.find({ members: { $all: [req.query.senderId, req.query.receiverId] } });
            if (checkConversation.length > 0) {
                checkMessages(checkConversation[0]._id);
            } else {
                return res.status(200).json([])
            }
        } else {
            checkMessages(conversationId);
        }
    } catch (error) {
        console.log('Error', error)
    }
})

//get users by userId
app.get('/users/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const users = await User.find({ _id: { $ne: userId } });
        const usersData = Promise.all(users.map(async (user) => {
            return {
                user: {
                    phone: user.phone,
                    username: user.username,
                    receiverId: user._id
                }
            }
        }))
        res.status(200).json(await usersData);
    } catch (error) {
        console.log('Error', error)
    }
})

//get users expertise
app.get('/user', async (req, res) => {
    try {
        const users = await User.find({ isExpert: true });
        const usersData = Promise.all(users.map(async (user) => {
            return {
                user: {
                    phone: user.phone,
                    username: user.username,
                    receiverId: user._id
                }
            }
        }))
        res.status(200).json(await usersData);
    } catch (error) {
        console.log('Error', error)
    }
})

//get all users
app.get('/users', async (req, res) => {
    try {
        const users = await User.find({});
        const usersData = Promise.all(users.map(async (user) => {
            return {
                user: {
                    phone: user.phone,
                    username: user.username,
                    receiverId: user._id
                }
            }
        }))
        res.status(200).json(await usersData);
    } catch (error) {
        console.log('Error', error)
    }
})

app.post("/addmsg", async (req,res) => {
    try {
        const { from, to, message } = req.body;
        console.log(from, to, message);

        const data = await MessagesByA.create({
            message: { text: message },
            users: [from, to],
            sender: from,
            });

        if (data) return res.json({ msg: "Message added successfully." });
        else return res.json({ msg: "Failed to add message to the database" });
      } catch (ex) {
        console.log(ex);
        next(ex);
      }
});

app.post("/getmsg", async (req,res,next) => {
    try {
        const { from, to } = req.body;
        console.log(from, to);

        const messages = await MessagesByA.find({
          users: {
            $all: [from, to],
          },
        }).sort({ updatedAt: 1 });
    
        const projectedMessages = messages.map((msg) => {
          return {
            fromSelf: msg.sender.toString() === from,
            message: msg.message.text,
          };
        });
        res.json(projectedMessages);

      } catch (ex) {
        next(ex);
      }
});


//resource not found
app.use((req,res,next) => {
    res.status(404).json({ message : "route not found"});
});

//server not found
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({message: "kijani hoise server e"});
});

module.exports = app;
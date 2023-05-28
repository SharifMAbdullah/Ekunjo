import React, { useEffect } from 'react';
import { useState } from 'react';
import '../CSSfiles/chat.css';
import userImage from '../images/user.png';
import sendImage from '../images/send.png';

export default function UserChat(){
    const [message, setMessage] = useState("");
    const [conversation, setConversation] = useState([]);
    const [user, setUser] = useState({});

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem("userDetails"));
        setUser(user);
    }, []);

    useEffect(() => {
        const logginUser = JSON.parse(localStorage.getItem("userDetails"));
        const fetchConversations = async (conversationID) => {
            const res = await fetch("http://localhost:5656/conversation/${logginUser.id}", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            const data = await res.json();
            setConversation(data);
        };
        fetchConversations();
    }, []);

    const fetchmessage = async (conversationID) => {
        const res = await fetch("http://localhost:5656/api/messages/${conversationID}", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });
        //body: JSON.stringify({ conversationID, senderID: user.id, message, receiverID });
        const data = await res.json();
        setConversation(data);
    };

    const sendMessage = async(e) => {
        e.preventDefault();
        setConversation([...conversation, { sender: user.id, message: message, receiverID:' ' }]);
        const receiverID = ' ';
        const conversationID = 'new';
        setMessage("");
        if(conversation.length !== 0){
            const receiverID = conversation[0].sender;
            const conversationID = conversation[0].conversationID;
        }
        
        const res = await fetch("http://localhost:5656/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ conversationID, senderID: user.id, message, receiverID }),
        });
        const data = await res.json();
        setConversation([...conversation, data]);
        console.log(conversation);
        e.target.elements.message.value = "";
    };


    return(
      <div className='serviceProvider'>
        <div className='serviceProvider__container'>
            <div className='user__middle'>
                <div className='serviceProvider__middle__container mt-3'>
                    <img src={userImage} alt='user' className='serviceProvider__image mx-4'/>                
                    <div className='ml-14 mx-14'>
                        <div className='serviceProvider__left__name mt-3'>
                            <h3>{user.username}</h3>
                            <p>{user.phone}</p>
                        </div>
                    </div>
                </div>
                <div className='h-75 border w-100 overflow-scroll shadow-sm' style={{scrollBehavior: 'smooth'}}>
                    <div className='serviceProvider__middle__container__chat'>
                        {
                            conversation.map((c) => (
                                <div className={c.sender === user.id ? "serviceProvider__middle__container__chat__right" : "serviceProvider__middle__container__chat__left"}>
                                    {c.message}
                                </div>
                            )) 
                        }
                    </div>
                </div>
                <div className='serviceProvider__middle__container__input'>
                    <input type='text' placeholder='Type a message' className='serviceProvider__middle__container__input__box' 
                        value={message} onChange={(e) => setMessage(e.target.value)} required
                    />
                    <button type='submit' disabled={!message} className='serviceProvider__middle__container__input__button' onClick={sendMessage}  >
                        <img src={sendImage} alt='send' height={30} width={30}/>
                    </button>
                </div>
            </div>
        </div>
      </div>
    );
}
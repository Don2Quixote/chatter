window.urlify = function urlify(text) {
    let htmlWithUrls = text.replace(/(https?:\/\/[^\s]+)/g, function(url) {
        return '<a target="_blank" href="' + url + '">' + url + '</a>';
    });
    let htmlWithNewLines = htmlWithUrls.replace(/[\n]/g, '<br>');
    return htmlWithNewLines;
}

window.hideElement = function hideElement(element, time = 300) {
    element.classList.add('no');
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
}

window.showElement = function showElement(element, time = 300) {
    element.classList.remove('no');
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
}

window.convertTsToTime = function convertTsToTime(ts) {
    let date = new Date(ts * 1000);
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let hoursString = hours > 9 ? hours.toString() : '0' + hours.toString();
    let minutesString = minutes > 9 ? minutes.toString() : '0' + minutes.toString();
    return `${hoursString}:${minutesString}`;
}

window.connectToLiveUpdates = function connectToLiveUpdates(accessKey) {
    return new Promise((resolve, reject) => {
        let ws = new WebSocket('ws://' + location.host + '/liveUpdates');
        let eventListeners = [];
        ws.onopen = resolve({
            subscribe: function(subscriptions) {
                ws.send(JSON.stringify({
                    accessKey: accessKey,
                    event: 'subscribe',
                    eventData: subscriptions
                }));
            },
            addEventListener: function(eventName, callback) {
                eventListeners.push({eventName, callback});
            }
        });
        ws.onmessage = function(message) {
            try {
                let data = JSON.parse(message.data);
                if (data.error) {
                    throw data.error;
                } else if (data.event) {
                    for (let eventListener of eventListeners) {
                        if (eventListener.eventName == data.event) {
                            eventListener.callback(data.eventData);
                        }
                    }
                }
            } catch (e) {
                for (let eventListener of eventListeners) {
                    if (eventListener.eventName == 'error') {
                        eventListener.callback(e);
                    }
                }
            }
        };
    });
}

window.chatsPageScript = async function chatsPageScript() {
    const ERR_INVALID_ACCESS_KEY = 1;

    const blobs = new Map();

    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        let clickPath = e.composedPath();
        let contextMenuInPath = clickPath.find((element) => element.id ? element.id == 'context-menu' : false);
        if (contextMenuInPath) {
            return;
        }
        let messageInPath = clickPath.find((element) => element.classList ? element.classList.contains('message') : false);
        let chatContainerInPath = clickPath.find((element) => element.id ? (element.id == 'chat-container' && +element.dataset.chatId > 0) : false);
        let chatButtonInPath = clickPath.find((element) => element.classList ? (element.classList.contains('chat-button') && +element.dataset.chatId > 0) : false);
        let imageAttachmentInPath = clickPath.find((element) => element.classList ? (element.classList.contains('image-attachment')) : false);
        let selectedMessages = document.getElementsByClassName('selectedMessage');
        if (messageInPath) {
            let additionalActionsGroups = [];
            if (imageAttachmentInPath) {
                additionalActionsGroups.push([{
                    label: 'Copy image',
                    onselect: function() {
                        let blobId = imageAttachmentInPath.dataset.blobId;
                        let blob = blobs.get(blobId);
                        navigator.clipboard.write([
                            new ClipboardItem({
                                [blob.type]: blob
                            })
                        ]);
                    }
                }]);
            }
            if (selectedMessages.length == 0) {
                if (+messageInPath.dataset.senderId == activeUserId || activeChatId == activeUserId) {
                    buildContextMenu(e.clientX, e.clientY, [...additionalActionsGroups, [
                        {
                            label: 'Delete message',
                            onselect: function() {
                                deleteMessages(activeChatId, [+messageInPath.dataset.messageId]);
                            }
                        }
                    ]], false);
                }
            } else {
                messageIdsToDelete = [];
                for (let message of selectedMessages) {
                    if (message.dataset.senderId == activeUserId || activeChatOwnerId == activeUserId) {
                        messageIdsToDelete.push(+message.dataset.messageId);
                    }
                }
                if (messageIdsToDelete.length > 0) {
                    buildContextMenu(e.clientX, e.clientY, [...additionalActionsGroups, [
                        {
                            label: 'Delete selected',
                            onselect: function() {
                                deleteMessages(activeChatId, messageIdsToDelete);
                            }
                        }
                    ]], false);
                }
            }
        } else if (chatContainerInPath) {
            let additionalActionsGroups = [];
            
            if (selectedMessages.length > 0) {
                messageIdsToDelete = [];
                for (let message of selectedMessages) {
                    if (message.dataset.senderId == activeUserId || activeChatOwnerId == activeUserId) {
                        messageIdsToDelete.push(+message.dataset.messageId);
                    }
                }

                if (messageIdsToDelete.length > 0) {
                    additionalActionsGroups.push([{
                        label: 'Delete selected',
                        onselect: function() {
                            deleteMessages(activeChatId, messageIdsToDelete);
                        }
                    }]);
                }
            }

            additionalActionsGroups.push([{
                label: 'Leave chat',
                onselect: function() {
                    leaveChat(+chatContainerInPath.dataset.chatId);
                }
            }]);

            buildContextMenu(e.clientX, e.clientY, additionalActionsGroups);
        } else if (chatButtonInPath) {
            buildContextMenu(e.clientX, e.clientY, [[{
                label: 'Leave chat',
                onselect: function() {
                    leavechat(+chatButtonInPath.dataset.chatId);
                }
            }]]);
        } else {
            buildContextMenu(e.clientX, e.clientY); 
        }
    });

    let messageInput = document.getElementById('message-input');

    let attachment = null;

    window.addEventListener('paste', async function(e) {
        for (item of e.clipboardData.items) {
            if (item.type == 'image/png') {
                let imageFile = item.getAsFile();
                // Probably will need to use array buffer to send binary data to server on sending message.
                // Importand moment is that function that sends message will not have the access to this variable.
                // The solution is to make it's scope wider as activeChatId for example.
                // let arrayBuffer = await imageFile.arrayBuffer();
                let blobUrl = URL.createObjectURL(imageFile);
                let attachmentImage = document.createElement('img');
                attachmentImage.className = 'input-attachment';
                attachmentImage.title = 'Click to remove';
                attachmentImage.src = blobUrl;
                attachmentImage.addEventListener('click', function() {
                    attachment = null;
                    document.getElementById('attachments').removeChild(attachmentImage);
                });
                document.getElementById('attachments').appendChild(attachmentImage);


                let reader = new FileReader();
                reader.readAsDataURL(imageFile);
                reader.onload = function() {
                    attachment = reader.result.slice(reader.result.indexOf(',') + 1);
                    console.log(attachment);
                };
                e.preventDefault();
            }
        }
    });
    
    let workingWithSubPanel = false;
    let loadingMessages = false;
    let cachedUsers = new Map;
    let accessKey = localStorage.getItem('accessKey');

    let activeChatId = null;
    let activeChatOwnerId = null;
    let activeUserId = null;

    let liveUpdates;
    try {
        liveUpdates = await connectToLiveUpdates(accessKey);
    } catch (e) {
        /* TODO: Add handling error on connection */
        console.log(e);
        return;
    }
    liveUpdates.addEventListener('error', console.log);
    liveUpdates.addEventListener('newMessage', function(newMessage) {
        console.log(newMessage);
        if (activeChatId == newMessage.chatId) appendNewMessage(newMessage);
        notify(newMessage.chatId);
    });
    liveUpdates.addEventListener('messagesDeleted', function(eventData) {
        console.log(eventData);
        if (eventData.chatId == activeChatId) {
            for (let messageId of eventData.deletedMessageIds) {
                removeDeletedMessage(eventData.chatId, messageId);
            }
        }
    });
    liveUpdates.addEventListener('chatMemberLeft', async function(eventData) {
        console.log(eventData);
        if (eventData.userId == activeUserId) {
            let chatButtons = document.getElementsByClassName('chat-button');
            for (let chatButton of chatButtons) {
                if (+chatButton.dataset.chatId == eventData.chatId) {
                    chatButton.parentElement.removeChild(chatButton);
                    break;
                }
            }
            if (eventData.chatId == activeChatId) {
                let otherChatToBuild = document.getElementsByClassName('chat-button')[0];
                if (otherChatToBuild.dataset.chatId) {
                    let chat = await getChat(+otherChatToBuild.dataset.chatId);
                    buildChat(chat);
                } else {
                    let chatContainerElement = document.getElementById('chat-container');
                    chatContainerElement.dataset.chatId = '';
                    hideElement(chatContainerElement);
                    let chatContents = document.getElementById('chat-contents');
                    chatContents.innerHTML = '';
                }
            }
        } else if (eventData.chatId == activeChatId) {
            let membersCountElement = document.getElementById('members-count');
            membersCountElement.innerText -= 1;
        }
    });

    messageInput.addEventListener('focus', function() {
        if (messageInput.classList.contains('not-touched')) {
            messageInput.classList.remove('not-touched');
            messageInput.innerText = '';
        }
    });
    messageInput.addEventListener('blur', function() {
        this.innerText = this.innerText.trim();
        if (this.innerText == '') {
            messageInput.classList.add('not-touched');
            messageInput.innerText = 'Start typing message...';
        }
    });
    let sendingMessage = false;
    messagesQueue = [];
    async function putMessageToSendingQueue(chatId, messageText, attachments) {
        if (!sendingMessage) {
            sendingMessage = true;
            try {
                let response = await sendMessage(chatId, messageText, attachments);
                let responseData = await response.json();
                if (responseData.error) {
                    throw responseData.error;
                }
            } catch (e) {
                console.log(`Error sending message ${messageText}, ${e}`);
            }
            sendingMessage = false;
            if (messagesQueue.length) {
                let messageToSend = messagesQueue[0];
                messagesQueue = messagesQueue.slice(1);
                putMessageToSendingQueue(messageToSend.chatId, messageToSend.messageText, attachments);
            }
        } else {
            messagesQueue.push({
                chatId, messageText
            });
        }
    }
    messageInput.addEventListener('keypress', async function(e) {
        if (this.innerText.length >= 2048) {
            e.preventDefault();
        }
        if (e.code == 'Enter' && !e.shiftKey) {
            e.preventDefault();
            let trimmedMessageText = this.innerText.trim();
            if (trimmedMessageText != '') {
                this.innerText = '';
                putMessageToSendingQueue(activeChatId, trimmedMessageText, attachment ? [attachment] : null);
                attachment = null;
                document.getElementById('attachments').innerHTML = '';
            }
        }
    });
    messageInput.addEventListener('input', async function(e) {
        if (this.innerText.length >= 2048) {
            this.innerText = this.innerText.slice(0, 2048);
            await delay(50);
            this.scrollTop = this.scrollHeight;
        }
    });

    let response;
    try {
        response = await fetch('/getMe', {
            method: 'GET',
            headers: {
                'Authorization': accessKey
            }
        });
    } catch(e) {
        console.log(e);
    }

    let data = {}
    if (response) {
        try {
            data = await response.json();
        } catch (e) {
            console.log(e);
            return;
        }
    }

    if (data.user) {
        activeUserId = data.user.id;
    } else {
        if (data.errorCode == ERR_INVALID_ACCESS_KEY) {
            localStorage.clear();
            location.replace('/');
        }
    }

    response = null;
    try {
        response = await fetch('/getChats', {
            method: 'GET',
            headers: {
                'Authorization': accessKey
            }
        });
    } catch (e) {
        console.log(e);
    }
    
    data = {};
    if (response) {
        try {
            data = await response.json();
        } catch (e) {
            console.log(e);
            return;
        }
    }

    if (data.chats) {
        if (data.chats.length) {
            liveUpdates.subscribe({
                chats: data.chats.map(chat => chat.id)
            });
            data.chats.sort((next, prev) => next.lastMessageTs - prev.lastMessageTs);
            for (let chat of data.chats) {
                appendChatButton(chat);
            }
        }
    } else {
        if (data.errorCode == ERR_INVALID_ACCESS_KEY) {
            localStorage.clear();
            location.replace('/');
        }
    }

    let chat;
    if (data.chats.length) {
        try {
            chat = await getChat(data.chats[data.chats.length - 1].id);
        } catch (e) {
            console.log(e);
            return;
        }
        buildChat(chat);
    } else {
        let chatContainerElement = document.getElementById('chat-container');
        hideElement(chatContainerElement);
    }

    let addChatButton = document.getElementById('add-chat-button');
    addChatButton.addEventListener('click', buildAddChatMenu);

    let preloader = document.getElementById('preloader');
    await hideElement(preloader);
    preloader.classList.remove('prepared');

    async function appendChatButton(chat) {
        let chatButton = document.createElement('div');
        chatButton.classList = 'chat-button';
        chatButton.dataset.chatId = chat.id;
        chatButton.innerText = chat.name[0].toUpperCase();
        chatButton.title = chat.name;
        chatButton.addEventListener('click', async function() {
            removeAddChatMenu();
            let chatContainer = document.getElementById('chat-container');
            if (+chatContainer.dataset.chatId == chat.id) {
                chatButton.classList.add('active');
                return;
            }
            let chatData = await getChat(chat.id);
            buildChat(chatData);
        });

        chatsPanel = document.getElementById('chats-panel');
        chatsPanel.insertAdjacentElement('afterbegin', chatButton);
    }

    async function buildChat(chat) {
        removeAddChatMenu();
        for (let chatButton of document.getElementsByClassName('chat-button')) {
            if (+chatButton.dataset.chatId == chat.id) {
                chatButton.classList.add('active');
                chatButton.classList.remove('new-message');
            } else {
                chatButton.classList.remove('active');
            }
        }

        let chatContainer = document.getElementById('chat-container');
        if (+chatContainer.dataset.chatId == chat.id) {
            return;
        }
        showElement(chatContainer);

        let oldChatContents = document.getElementById('chat-contents');
        let chatContents = document.createElement('div');
        chatContents.id = 'chat-contents';
        chatContents.innerHTML = '';

        chatContainer.dataset.chatId = chat.id;
        chatContainer.replaceChild(chatContents, oldChatContents);

        activeChatId = chat.id;
        activeChatOwnerId = chat.ownerId;

        let chatNameElement = document.getElementById('chat-name');
        let membersCountElement = document.getElementById('members-count');

        chatNameElement.innerText = chat.name;
        membersCountElement.innerText = chat.membersCount;

        chatContents.addEventListener('wheel', function(e) {
            if (this.scrollTop < 200 && e.deltaY < 0) {
                let messages = document.getElementsByClassName('message');
                let lastMessage = messages[messages.length - 1];
                let firstMessage = messages[0];
                if (messages.length && +firstMessage.dataset.messageId != 1) {
                    let offset = +lastMessage.dataset.messageId - firstMessage.dataset.messageId + 1;
                    loadMessages(activeChatId, offset, 20, true);
                }
            }
        });
        let lastScrollTop = chatContents.scrollTop;
        chatContents.addEventListener('scroll', function(e) {
            let newScrollTop = this.scrollTop;
            if (this.scrollTop < 200 && newScrollTop < lastScrollTop) {
                let messages = document.getElementsByClassName('message');
                let lastMessage = messages[messages.length - 1];
                let firstMessage = messages[0];
                if (messages.length && +firstMessage.dataset.messageId != 1) {
                    let offset = +lastMessage.dataset.messageId - firstMessage.dataset.messageId + 1;
                    loadMessages(activeChatId, offset, 20, true);
                }
            }
            lastScrollTop = newScrollTop;
        });

        let messages = chat.messages.items;
        for (let messageItr1 = 0; messageItr1 < messages.length; messageItr1++) {
            let messagesStretchElement = document.createElement('div');
            messagesStretchElement.classList = 'messages-stretch';
            messagesStretchElement.dataset.senderId = messages[messageItr1].senderId;

                let avatarElement = document.createElement('div');
                avatarElement.classList = 'message-avatar';
                avatarElement.innerHTML = messages[messageItr1].senderUsername[0].toUpperCase();

                let mainMessagesStretchPart = document.createElement('div');
                mainMessagesStretchPart.classList = 'main-messages-stretch-part';

                    let senderUsernameElement = document.createElement('div');
                    senderUsernameElement.classList = 'sender-username';
                    senderUsernameElement.innerText = messages[messageItr1].senderUsername;
                
                    let messagesBodyElement = document.createElement('div');
                    messagesBodyElement.classList = 'messages-body';

                    let lastMessageSentTs = messages[messageItr1].ts;
                    let stretchMessagesCount = 0;
                    for (
                        let messageItr2 = messageItr1;
                        messageItr2 < messages.length &&
                        messages[messageItr2].senderId == messages[messageItr1].senderId &&
                        new Date(messages[messageItr2].ts * 1000).getDate() == new Date(messages[messageItr1].ts * 1000).getDate();
                        messageItr2++
                    ) {
                        stretchMessagesCount++;
                        if (!cachedUsers.get(messages[messageItr2].senderId)) {
                            cachedUsers.set(messages[messageItr2].senderId, messages[messageItr2].senderUsername);
                        }
                        let messageElement = document.createElement('div');
                        messageElement.classList = 'message';
                        if (messages[messageItr2].attachments && messages[messageItr2].attachments.length) {
                            messageElement.classList.add('with-attachments');

                            let textBlock = document.createElement('div');
                            textBlock.className = 'message-text';
                            textBlock.innerHTML = urlify(messages[messageItr2].text);

                            let attachmentBlock = document.createElement('div');
                            attachmentBlock.className = 'message-attachment';

                            let attachmentContent = await getAttachment(messages[messageItr2].attachments[0].hash);

                            let blobId = parseInt(Math.random() * 100000).toString();
                            blobs.set(blobId, attachmentContent);

                            let imageElement = document.createElement('img');
                            imageElement.className = 'image-attachment';
                            imageElement.dataset.blobId = blobId;
                            imageElement.src = URL.createObjectURL(attachmentContent);

                            attachmentBlock.appendChild(imageElement);

                            messageElement.appendChild(textBlock);
                            messageElement.appendChild(attachmentBlock);
                        } else {
                            messageElement.innerHTML = urlify(messages[messageItr2].text);
                        }
                        messageElement.dataset.chatId = messages[messageItr2].chatId;
                        messageElement.dataset.messageId = messages[messageItr2].id;
                        messageElement.dataset.senderId = messages[messageItr2].senderId;
                        messageElement.dataset.ts = messages[messageItr2].ts;
                        messageElement.addEventListener('click', function(e) {
                            let somethingSelected = window.getSelection().type == 'Range';
                            let clickOnLink = e.composedPath().find((element) => element.tagName == 'A');
                            if (!somethingSelected && !clickOnLink) {
                                this.classList.toggle('selectedMessage');
                            }
                        });
                        
                        messagesBodyElement.insertAdjacentElement('afterbegin', messageElement);
                        messageItr1 = messageItr2;
                    }
                    let firstMessageSentTs = messages[messageItr1].ts;

                mainMessagesStretchPart.appendChild(senderUsernameElement);
                mainMessagesStretchPart.appendChild(messagesBodyElement);

                let sentTimeElement = document.createElement('div');
                sentTimeElement.classList = 'sent-time';

                    sentTimeTopPlugElement = document.createElement('div');
                    sentTimeTopPlugElement.classList = 'sent-time-top-plug';
                    sentTimeTopPlugElement.innerText = 'P';

                    sentTimeElement.appendChild(sentTimeTopPlugElement);

                    if (stretchMessagesCount > 1) {
                        firstMessageSentTimeElement = document.createElement('div');
                        firstMessageSentTimeElement.classList = 'first-message-sent-time';
                        firstMessageSentTimeElement.innerText = convertTsToTime(firstMessageSentTs);
                        
                        sentTimeSeparatorElement = document.createElement('div');
                        sentTimeSeparatorElement.classList = 'sent-time-separator';

                        lastMessageSentTimeElement = document.createElement('div');
                        lastMessageSentTimeElement.classList = 'last-message-sent-time';
                        lastMessageSentTimeElement.innerText = convertTsToTime(lastMessageSentTs);

                        sentTimeElement.appendChild(firstMessageSentTimeElement);
                        sentTimeElement.appendChild(sentTimeSeparatorElement);
                        sentTimeElement.appendChild(lastMessageSentTimeElement);
                    } else {
                        let oneMessageSentTimeElement = document.createElement('div');
                        oneMessageSentTimeElement.classList = 'one-message-sent-time';
                        oneMessageSentTimeElement.innerText = convertTsToTime(firstMessageSentTs);

                        sentTimeElement.appendChild(oneMessageSentTimeElement);
                    }

                messagesStretchElement.appendChild(avatarElement);
                messagesStretchElement.appendChild(mainMessagesStretchPart);
                messagesStretchElement.appendChild(sentTimeElement);

            chatContents.insertAdjacentElement('afterbegin', messagesStretchElement);
        }
        chatContents.scrollTop = chatContents.scrollHeight;

        messageInput.focus();
    }

    async function notify(chatId) {
        let chatsPanel = document.getElementById('chats-panel');
        let chatButtons = chatsPanel.getElementsByClassName('chat-button');
        for (let chatButton of chatButtons) {
            if (chatButton.dataset.chatId == chatId) {
                chatsPanel.removeChild(chatButton);
                chatsPanel.insertAdjacentElement('afterbegin', chatButton);
                if (activeChatId != chatId) {
                    chatButton.classList.add('new-message');
                }
            }
        }
    }

    async function appendNewMessage(newMessage) {
        let chatContents = document.getElementById('chat-contents');
        let messagesStretches = document.getElementsByClassName('messages-stretch');
        let lastMessagesStretch = messagesStretches[messagesStretches.length - 1];

        let wasInTheBottom = (chatContents.scrollTop + chatContents.clientHeight + 50) > chatContents.scrollHeight;

        let senderUsername = cachedUsers.get(newMessage.senderId);

        if (
            lastMessagesStretch &&
            (+lastMessagesStretch.dataset.senderId == newMessage.senderId) &&
            new Date(+lastMessagesStretch.getElementsByClassName('message')[0].dataset.ts * 1000).getDate() == new Date(newMessage.ts * 1000).getDate()
        ) {
            let stretchMessagesCount = lastMessagesStretch.getElementsByClassName('message').length;
            let wasOnlyOneMessageInStretch = stretchMessagesCount == 1;

            let messagesBody = lastMessagesStretch.getElementsByClassName('messages-body')[0];

            let messageElement = document.createElement('div');
            messageElement.classList = 'message';
            messageElement.innerHTML = urlify(newMessage.text);
            messageElement.dataset.chatId = newMessage.chatId;
            messageElement.dataset.messageId = newMessage.messageId;
            messageElement.dataset.senderId = newMessage.senderId;
            messageElement.dataset.ts = newMessage.ts;
            messageElement.addEventListener('click', function(e) {
                let somethingSelected = window.getSelection().type == 'Range';
                let clickOnLink = e.composedPath().find((element) => element.tagName == 'A');
                if (!somethingSelected && !clickOnLink) {
                    this.classList.toggle('selectedMessage');
                }
            });

            messagesBody.appendChild(messageElement);

            if (wasOnlyOneMessageInStretch) {
                let sentTimeElement = lastMessagesStretch.getElementsByClassName('sent-time')[0];
                let oneMessageSentTimeElement = sentTimeElement.getElementsByClassName('one-message-sent-time')[0];
                oneMessageSentTimeElement.classList = 'first-message-sent-time';

                let sentTimeSeparatorElement = document.createElement('div');
                sentTimeSeparatorElement.classList = 'sent-time-separator';

                let lastMessageSentTimeElement = document.createElement('div');
                lastMessageSentTimeElement.classList = 'last-message-sent-time';
                lastMessageSentTimeElement.innerText = convertTsToTime(newMessage.ts);

                sentTimeElement.appendChild(sentTimeSeparatorElement);
                sentTimeElement.appendChild(lastMessageSentTimeElement);
            } else {
                let sentTimeElement = lastMessagesStretch.getElementsByClassName('sent-time')[0];
                lastMessageSentTimeElement = sentTimeElement.getElementsByClassName('last-message-sent-time')[0];
                lastMessageSentTimeElement.innerText = convertTsToTime(newMessage.ts);
            }
        } else {
            let messagesStretchElement = document.createElement('div');
            messagesStretchElement.classList = 'messages-stretch';
            messagesStretchElement.dataset.senderId = newMessage.senderId;

                let avatarElement = document.createElement('div');
                avatarElement.classList = 'message-avatar';
                avatarElement.innerText = senderUsername ? senderUsername[0].toUpperCase() : '#';

                let mainMessagesStretchPart = document.createElement('div');
                mainMessagesStretchPart.classList = 'main-messages-stretch-part';

                    let senderUsernameElement = document.createElement('div');
                    senderUsernameElement.classList = 'sender-username';
                    senderUsernameElement.innerText = senderUsername ?? 'Noname';

                    let messagesBodyElement = document.createElement('div');
                    messagesBodyElement.classList = 'messages-body';

                        let messageElement = document.createElement('div');
                        messageElement.classList = 'message';
                        messageElement.innerHTML = urlify(newMessage.text);
                        messageElement.dataset.chatId = newMessage.chatId;
                        messageElement.dataset.messageId = newMessage.messageId;
                        messageElement.dataset.senderId = newMessage.senderId;
                        messageElement.dataset.ts = newMessage.ts;
                        messageElement.addEventListener('click', function(e) {
                            let somethingSelected = window.getSelection().type == 'Range';
                            let clickOnLink = e.composedPath().find((element) => element.tagName == 'A');
                            if (!somethingSelected && !clickOnLink) {
                                this.classList.toggle('selectedMessage');
                            }
                        });

                    messagesBodyElement.appendChild(messageElement);

                mainMessagesStretchPart.appendChild(senderUsernameElement);
                mainMessagesStretchPart.appendChild(messagesBodyElement);

            let sentTimeElement = document.createElement('div');
            sentTimeElement.classList = 'sent-time';

                sentTimeTopPlugElement = document.createElement('div');
                sentTimeTopPlugElement.classList = 'sent-time-top-plug';
                sentTimeTopPlugElement.innerText = 'P';

                let oneMessageSentTimeElement = document.createElement('div');
                oneMessageSentTimeElement.classList = 'one-message-sent-time';
                oneMessageSentTimeElement.innerText = convertTsToTime(newMessage.ts);

            sentTimeElement.appendChild(sentTimeTopPlugElement);
            sentTimeElement.appendChild(oneMessageSentTimeElement);

            messagesStretchElement.appendChild(avatarElement);
            messagesStretchElement.appendChild(mainMessagesStretchPart);
            messagesStretchElement.appendChild(sentTimeElement);

            chatContents.appendChild(messagesStretchElement);

            if (!senderUsername) {
                try {
                    let sender = await getUser(newMessage.senderId);
                    cachedUsers.set(sender.id, sender.username);
                    avatarElement.innerText = sender.username[0].toUpperCase();
                    senderUsernameElement.innerText = sender.username;
                } catch (e) {
                    console.log(e);
                }
            }
        }

        if (newMessage.senderId == activeUserId || wasInTheBottom) {
            chatContents.scrollTop = chatContents.scrollHeight;
        }
    }

    function removeDeletedMessage(chatId, messageId) {
        if (activeChatId != chatId) return;
        
        let messageElement = [...document.getElementsByClassName('message')].find(m => m.dataset.messageId == messageId);
        if (messageElement) {
            let messagesStretchElement = messageElement.parentElement.parentElement.parentElement;
            let messagesCount = messagesStretchElement.getElementsByClassName('message').length;
            console.log(messagesCount);
            if (messagesCount == 1) {
                messagesStretchElement.parentElement.removeChild(messagesStretchElement);
            } else if (messagesCount == 2) {
                messageElement.parentElement.removeChild(messageElement);

                let firstMessageSentTimeElement = messagesStretchElement.getElementsByClassName('first-message-sent-time')[0];
                let sentTimeSeparatorElement = messagesStretchElement.getElementsByClassName('sent-time-separator')[0];
                let lastMessageSentTimeElement = messagesStretchElement.getElementsByClassName('last-message-sent-time')[0];

                let lastMessageInStretchElement = messagesStretchElement.getElementsByClassName('message')[0];
                console.log(parseInt(lastMessageInStretchElement.dataset.messageId));
                if (parseInt(lastMessageInStretchElement.dataset.messageId) > messageId) {
                    firstMessageSentTimeElement.parentElement.removeChild(firstMessageSentTimeElement);
                    lastMessageSentTimeElement.classList = 'one-message-sent-time';
                } else {
                    lastMessageSentTimeElement.parentElement.removeChild(lastMessageSentTimeElement);
                    firstMessageSentTimeElement.classList = 'one-message-sent-time';
                }
                sentTimeSeparatorElement.parentElement.removeChild(sentTimeSeparatorElement);
            } else {
                messageElement.parentElement.removeChild(messageElement);
            }
        }
    }

    function delay(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
    
    async function loadMessages(chatId, offset, messagesCount, withUsernames) {
        if (loadingMessages) return;
        loadingMessages = true

        try {
            let query = `chatId=${chatId ?? ''}&offset=${offset ?? ''}&messagesCount=${messagesCount ?? ''}&withUsernames=${withUsernames ? 'true' : 'false'}`
            let response = await fetch(`/getMessages?${query}`, {
                method: 'GET',
                headers: {
                    'Authorization': accessKey
                }
            });

            let data = await response.json();

            if (data.error) {
                throw data;
            } else if (!data.messages || !data.messages.length) {
                throw new Error('No messages in response');
            }

            for (let message of data.messages) {
                appendOldMessage(message);
                await delay(50);
            }
        } catch (e) {
            console.log(e);
        }
        
        loadingMessages = false;
    }

    async function appendOldMessage(oldMessage) {
        let chatContents = document.getElementById('chat-contents');
        let messagesStretches = document.getElementsByClassName('messages-stretch');
        let firstMessagesStretch = messagesStretches[0];

        let senderUsername = cachedUsers.get(oldMessage.senderId);
        if (!senderUsername) {
            cachedUsers.set(oldMessage.senderId, oldMessage.senderUsername);
            senderUsername = oldMessage.senderUsername;
        }

        if (firstMessagesStretch) {
            if (
                +firstMessagesStretch.dataset.senderId == oldMessage.senderId &&
                new Date(+firstMessagesStretch.getElementsByClassName('message')[0].dataset.ts * 1000).getDate() == new Date(oldMessage.ts * 1000).getDate()
            ) {
                let messagesBody = firstMessagesStretch.getElementsByClassName('messages-body')[0];
                let messagesCount = messagesBody.getElementsByClassName('message').length;
                let wasOnlyOneMessageInStretch = messagesCount == 1;

                let messageElement = document.createElement('div');
                messageElement.classList = 'message';
                messageElement.innerHTML = urlify(oldMessage.text);
                messageElement.dataset.chatId = oldMessage.chatId;
                messageElement.dataset.messageId = oldMessage.id;
                messageElement.dataset.senderId = oldMessage.senderId;
                messageElement.dataset.ts = oldMessage.ts;
                messageElement.addEventListener('click', function(e) {
                    let somethingSelected = window.getSelection().type == 'Range';
                    let clickOnLink = e.composedPath().find((element) => element.tagName == 'A');
                    if (!somethingSelected && !clickOnLink) {
                        this.classList.toggle('selectedMessage');
                    }
                });

                messagesBody.insertAdjacentElement('afterbegin', messageElement);

                if (wasOnlyOneMessageInStretch) {
                    let sentTimeElement = firstMessagesStretch.getElementsByClassName('sent-time')[0];
                    let oneMessageSentTimeElement = sentTimeElement.getElementsByClassName('one-message-sent-time')[0];
                    oneMessageSentTimeElement.classList = 'last-message-sent-time';

                    let sentTimeSeparatorElement = document.createElement('div');
                    sentTimeSeparatorElement.classList = 'sent-time-separator';

                    let firstMessageSentTimeElement = document.createElement('div');
                    firstMessageSentTimeElement.classList = 'first-message-sent-time';
                    firstMessageSentTimeElement.innerText = convertTsToTime(oldMessage.ts);

                    sentTimeElement.insertBefore(firstMessageSentTimeElement, oneMessageSentTimeElement);
                    sentTimeElement.insertBefore(sentTimeSeparatorElement, oneMessageSentTimeElement);
                } else {
                    let sentTimeElement = firstMessagesStretch.getElementsByClassName('sent-time')[0];
                    firstMessageSentTimeElement = sentTimeElement.getElementsByClassName('first-message-sent-time');
                    firstMessageSentTimeElement.innerText = convertTsToTime(oldMessage.ts);
                }
            } else {
                let messagesStretchElement = document.createElement('div');
                messagesStretchElement.classList = 'messages-stretch';
                messagesStretchElement.dataset.senderId = oldMessage.senderId;

                    let avatarElement = document.createElement('div');
                    avatarElement.classList = 'message-avatar';
                    avatarElement.innerText = senderUsername ? senderUsername[0].toUpperCase() : '#';

                    let mainMessagesStretchPart = document.createElement('div');
                    mainMessagesStretchPart.classList = 'main-messages-stretch-part';

                        let senderUsernameElement = document.createElement('div');
                        senderUsernameElement.classList = 'sender-username';
                        senderUsernameElement.innerText = senderUsername ?? 'Noname';

                        let messagesBodyElement = document.createElement('div');
                        messagesBodyElement.classList = 'messages-body';

                            let messageElement = document.createElement('div');
                            messageElement.classList = 'message';
                            messageElement.innerHTML = urlify(oldMessage.text);
                            messageElement.dataset.chatId = oldMessage.chatId;
                            messageElement.dataset.messageId = oldMessage.id;
                            messageElement.dataset.senderId = oldMessage.senderId;
                            messageElement.dataset.ts = oldMessage.ts;
                            messageElement.addEventListener('click', function(e) {
                                let somethingSelected = window.getSelection().type == 'Range';
                                let clickOnLink = e.composedPath().find((element) => element.tagName == 'A');
                                if (!somethingSelected && !clickOnLink) {
                                    this.classList.toggle('selectedMessage');
                                }
                            });

                        messagesBodyElement.appendChild(messageElement);

                    mainMessagesStretchPart.appendChild(senderUsernameElement);
                    mainMessagesStretchPart.appendChild(messagesBodyElement);

                    let sentTimeElement = document.createElement('div');
                    sentTimeElement.classList = 'sent-time';
    
                        sentTimeTopPlugElement = document.createElement('div');
                        sentTimeTopPlugElement.classList = 'sent-time-top-plug';
                        sentTimeTopPlugElement.innerText = 'P';
    
                        sentTimeElement.appendChild(sentTimeTopPlugElement);
    
                        oneMessageSentTimeElement = document.createElement('div');
                        oneMessageSentTimeElement.classList = 'one-message-sent-time';
                        oneMessageSentTimeElement.innerText = convertTsToTime(oldMessage.ts);

                        sentTimeElement.appendChild(oneMessageSentTimeElement);
                        // sentTimeElement.appendChild(sentTimeSeparatorElement);
                        // sentTimeElement.appendChild(lastMessageSentTimeElement);

                messagesStretchElement.appendChild(avatarElement);
                messagesStretchElement.appendChild(mainMessagesStretchPart);
                messagesStretchElement.appendChild(sentTimeElement);

                chatContents.insertAdjacentElement('afterbegin', messagesStretchElement);

                if (!senderUsername) {
                    try {
                        let sender = await getUser(newMessage.senderId);
                        cachedUsers.set(sender.id, sender.username);
                        avatarElement.innerText = sender.username[0].toUpperCase();
                        senderUsernameElement.innerText = sender.username;
                    } catch (e) {
                        console.log(e);
                    }
                }
            }
        }
    }

    async function buildAddChatMenu() {
        if (workingWithSubPanel) return;
        workingWithSubPanel = true;

        let chatContainer = document.getElementById('chat-container');
        let subPanel = document.getElementById('sub-panel');

        if (!subPanel.classList.contains('no')) {
            let chatContainer = document.getElementById('chat-container');
            if (chatContainer.dataset.chatId) {
                let chatButtons = document.getElementsByClassName('chat-button');
                for (let chatButton of chatButtons) {
                    if (chatButton.dataset.chatId == chatContainer.dataset.chatId) {
                        chatButton.classList.add('active');
                    } else {
                        chatButton.classList.remove('active');
                    }
                }
            }
            workingWithSubPanel = false;
            removeAddChatMenu();
            return;
        }

        for (let chatButton of document.getElementsByClassName('chat-button')) {
            chatButton.classList.remove('active');
        }
        document.getElementById('add-chat-button').classList.add('active');

        await showElement(subPanel, 300);

        subPanel.classList = 'add-chat-menu';

        let enterChatButton = document.createElement('button');
        enterChatButton.id = 'enter-chat-button';
        enterChatButton.classList = 'button no';
        enterChatButton.innerText = 'Enter Chat';
        enterChatButton.addEventListener('click', function() {
            buildEnterChatMenu();
        });

        let createChatButton = document.createElement('button');
        createChatButton.id = 'create-chat-button';
        createChatButton.classList = 'button no';
        createChatButton.innerText = 'Create Chat';
        createChatButton.addEventListener('click', function() {
            buildCreateChatMenu();
        });

        subPanel.appendChild(enterChatButton);
        subPanel.appendChild(createChatButton);
        
        await delay(50);

        showElement(enterChatButton);
        showElement(createChatButton);

        workingWithSubPanel = false;
    }

    async function removeAddChatMenu() {
        if (workingWithSubPanel) return;
        workingWithSubPanel = true;

        let subPanel = document.getElementById('sub-panel');
        if (subPanel.classList.contains('no')) {
            workingWithSubPanel = false;
            return;
        }
        let addChatButton = document.getElementById('add-chat-button');
        addChatButton.classList.remove('active');
        for (let element of subPanel.childNodes) {
            hideElement(element);
        }
        await delay(300);
        await hideElement(subPanel);
        subPanel.innerHTML = '';

        workingWithSubPanel = false;
    }

    async function buildEnterChatMenu(menuTitleText) {
        let subPanel = document.getElementById('sub-panel');
        for (let element of subPanel.childNodes) {
            hideElement(element);
        }
        await delay(300);
        subPanel.innerHTML = '';
        
        let menuTitle = document.createElement('div');
        menuTitle.id = 'menu-title';
        menuTitle.classList = 'no';
        menuTitle.innerText = menuTitleText ?? 'Enter Chat';

        function testInputs(chatName, chatPassword) {
            isChatNameCorrect = /^[a-zA-Z0-9_-]{5,16}$/.test(chatName.value);
            isChatPasswordCorrect = chatPassword.value.length <= 32;
            return isChatNameCorrect && isChatPasswordCorrect;
        }

        let chatNameInput = document.createElement('input');
        chatNameInput.id = 'chat-name-input';
        chatNameInput.classList = 'input no';
        chatNameInput.autocomplete = 'off';
        chatNameInput.placeholder = 'Chat name';
        chatNameInput.addEventListener('input', function() {
            if (testInputs(chatNameInput, chatPasswordInput)) {
                submitButton.classList.remove('not-allowed');
            } else {
                submitButton.classList.add('not-allowed');
            }
        });
        chatNameInput.addEventListener('keydown', async function(e) {
            if (e.code == 'Tab') {
                e.preventDefault();
                chatPasswordInput.focus();
            } else if (e.code == 'Enter') {
                e.preventDefault();
                if (testInputs(chatNameInput, chatPasswordInput)) {
                    try {
                        let chat = await enterChat(chatNameInput.value, chatPasswordInput.value);
                        liveUpdates.subscribe({
                            chats: [chat.id]
                        });
                        appendChatButton(chat);
                        buildChat(chat);
                    } catch (e) {
                        console.log(e);
                        buildEnterChatMenu(e.error || 'Error occured');
                    }
                }
            }
        });

        let chatPasswordInput = document.createElement('input');
        chatPasswordInput.id = 'chat-password-input';
        chatPasswordInput.classList = 'input no';
        chatPasswordInput.autocomplete = 'off';
        chatPasswordInput.placeholder = 'Password';
        chatPasswordInput.type = 'password';
        chatPasswordInput.addEventListener('input', function() {
            if (testInputs(chatNameInput, chatPasswordInput)) {
                submitButton.classList.remove('not-allowed');
            } else {
                submitButton.classList.add('not-allowed');
            }
        });
        chatPasswordInput.addEventListener('keydown', async function(e) {
            if (e.code == 'Tab') {
                e.preventDefault();
                chatNameInput.focus();
            } else if (e.code == 'Enter') {
                e.preventDefault();
                if (testInputs(chatNameInput, chatPasswordInput)) {
                    try {
                        let chat = await enterChat(chatNameInput.value, chatPasswordInput.value);
                        liveUpdates.subscribe({
                            chats: [chat.id]
                        });
                        appendChatButton(chat);
                        buildChat(chat);
                    } catch (e) {
                        console.log(e);
                        buildEnterChatMenu(e.error || 'Error occured');
                    }
                }
            }
        });

        let submitButton = document.createElement('button');
        submitButton.id = 'submit-button';
        submitButton.classList = 'button not-allowed no';
        submitButton.innerText = 'Confirm';
        submitButton.addEventListener('click', async function() {
            if (testInputs(chatNameInput, chatPasswordInput)) {
                try {
                    let chat = await enterChat(chatNameInput.value, chatPasswordInput.value);
                    liveUpdates.subscribe({
                        chats: [chat.id]
                    });
                    appendChatButton(chat)
                    buildChat(chat);
                } catch (e) {
                    console.log(e);
                    buildEnterChatMenu(e.error || 'Error occured');
                }
            }
        });

        subPanel.appendChild(menuTitle);
        subPanel.appendChild(chatNameInput);
        subPanel.appendChild(chatPasswordInput);
        subPanel.appendChild(submitButton);

        await delay(50);

        showElement(menuTitle);
        showElement(chatNameInput);
        showElement(chatPasswordInput);
        showElement(submitButton);

        chatNameInput.focus();
    }

    async function buildCreateChatMenu(menuTitleText) {
        let subPanel = document.getElementById('sub-panel');
        for (let element of subPanel.childNodes) {
            hideElement(element);
        }
        await delay(300);
        subPanel.innerHTML = '';
        
        let menuTitle = document.createElement('div');
        menuTitle.id = 'menu-title';
        menuTitle.classList = 'no';
        menuTitle.innerText = menuTitleText ?? 'Create Chat';

        function testInputs(chatName, chatPassword) {
            isChatNameCorrect = /^[a-zA-Z0-9_-]{5,16}$/.test(chatName.value);
            isChatPasswordCorrect = chatPassword.value.length <= 32;
            return isChatNameCorrect && isChatPasswordCorrect;
        }

        let chatNameInput = document.createElement('input');
        chatNameInput.id = 'chat-name-input';
        chatNameInput.classList = 'input no';
        chatNameInput.autocomplete = 'off';
        chatNameInput.placeholder = 'Chat name';
        chatNameInput.addEventListener('input', function() {
            if (testInputs(chatNameInput, chatPasswordInput)) {
                submitButton.classList.remove('not-allowed');
            } else {
                submitButton.classList.add('not-allowed');
            }
        });
        chatNameInput.addEventListener('keydown', async function(e) {
            if (e.code == 'Tab') {
                e.preventDefault();
                chatPasswordInput.focus();
            } else if (e.code == 'Enter') {
                e.preventDefault();
                if (testInputs(chatNameInput, chatPasswordInput)) {
                    try {
                        let chat = await createChat(chatNameInput.value, chatPasswordInput.value);
                        liveUpdates.subscribe({
                            chats: [chat.id]
                        });
                        appendChatButton(chat);
                        buildChat(chat);
                    } catch (e) {
                        console.log('Error', e);
                        buildCreateChatMenu(e.error || 'Error occured');
                    }
                }
            }
        });

        let chatPasswordInput = document.createElement('input');
        chatPasswordInput.id = 'chat-password-input';
        chatPasswordInput.classList = 'input no';
        chatPasswordInput.autocomplete = 'off';
        chatPasswordInput.placeholder = 'Password';
        chatPasswordInput.type = 'password';
        chatPasswordInput.addEventListener('input', function() {
            if (testInputs(chatNameInput, chatPasswordInput)) {
                submitButton.classList.remove('not-allowed');
            } else {
                submitButton.classList.add('not-allowed');
            }
        });
        chatPasswordInput.addEventListener('keydown', async function(e) {
            if (e.code == 'Tab') {
                e.preventDefault();
                chatNameInput.focus();
            } else if (e.code == 'Enter') {
                e.preventDefault();
                if (testInputs(chatNameInput, chatPasswordInput)) {
                    try {
                        let chat = await createChat(chatNameInput.value, chatPasswordInput.value);
                        liveUpdates.subscribe({
                            chats: [chat.id]
                        });
                        appendChatButton(chat);
                        buildChat(chat);
                    } catch (e) {
                        console.log('Error', e);
                        buildCreateChatMenu(e.error || 'Error occured');
                    }
                }
            }
        });

        let submitButton = document.createElement('button');
        submitButton.id = 'submit-button';
        submitButton.classList = 'button not-allowed no';
        submitButton.innerText = 'Confirm';
        submitButton.addEventListener('click', async function() {
            if (testInputs(chatNameInput, chatPasswordInput)) {
                try {
                    try {
                        let chat = await createChat(chatNameInput.value, chatPasswordInput.value);
                        liveUpdates.subscribe({
                            chats: [chat.id]
                        });
                        appendChatButton(chat);
                        buildChat(chat);
                    } catch (e) {
                        console.log('Error', e);
                        buildCreateChatMenu(e.error || 'Error occured');
                    }
                } catch (e) {
                    console.log(e);
                    buildCreateChatMenu(e.error || 'Error occured');
                }
            }
        });

        subPanel.appendChild(menuTitle);
        subPanel.appendChild(chatNameInput);
        subPanel.appendChild(chatPasswordInput);
        subPanel.appendChild(submitButton);

        await delay(50);

        showElement(menuTitle);
        showElement(chatNameInput);
        showElement(chatPasswordInput);
        showElement(submitButton);

        chatNameInput.focus();
    }

    function buildContextMenu(x, y, additionalActionsGroups = [], defaultActions = true) {
        let oldContextMenuElement = document.getElementById('context-menu');
        if (oldContextMenuElement) {
            document.body.removeChild(oldContextMenuElement);
        }

        let contextMenuElement = document.createElement('div');
        contextMenuElement.id = 'context-menu';
        contextMenuElement.style.left = `${x}px`;
        contextMenuElement.style.top = `${y}px`;

        for (let ag in additionalActionsGroups) {
            for (let action of additionalActionsGroups[ag]) {
                let actionButton = document.createElement('div');
                actionButton.classList = 'context-menu-button';
                actionButton.innerText = action.label;
                actionButton.addEventListener('click', function() {
                    action.onselect();
                    removeContextMenuElement(true);
                });

                contextMenuElement.appendChild(actionButton);
            }
            let contextMenuSeparatorElement = document.createElement('div');
            contextMenuSeparatorElement.classList = 'context-menu-separator';
                
            if (ag < additionalActionsGroups.length - 1) {
                contextMenuElement.appendChild(contextMenuSeparatorElement);
            } else if (ag == additionalActionsGroups.length - 1 && defaultActions) {
                contextMenuElement.appendChild(contextMenuSeparatorElement);
            }
        }

        if (defaultActions) {
            let addChatButton = document.createElement('div');
            addChatButton.classList = 'context-menu-button';
            addChatButton.innerText = 'Add chat';
            addChatButton.addEventListener('click', function() {
                buildAddChatMenu();
                removeContextMenuElement(true);
            });

            let exitAccountButton = document.createElement('div');
            exitAccountButton.classList = 'context-menu-button';
            exitAccountButton.innerText = 'Exit account';
            exitAccountButton.addEventListener('click', exitAccount);

            contextMenuElement.appendChild(addChatButton);
            contextMenuElement.appendChild(exitAccountButton);
        }

        document.body.appendChild(contextMenuElement);

        function removeContextMenuElement(e) {
            if (e === true || !e.composedPath().includes(contextMenuElement)) {
                try {
                    document.body.removeChild(contextMenuElement);
                } catch {}
                document.body.removeEventListener('click', removeContextMenuElement);
            }
        }
        document.body.addEventListener('click', removeContextMenuElement);
    }
    function buildGlobalContextMenu(x, y, additionalActions) {
        let oldContextMenuElement = document.getElementById('context-menu');
        if (oldContextMenuElement) {
            document.body.removeChild(oldContextMenuElement);
        }

        let contextMenuElement = document.createElement('div');
        contextMenuElement.id = 'context-menu';
        contextMenuElement.style.left = `${x}px`;
        contextMenuElement.style.top = `${y}px`;

            for (let action of additionalActions) {
                let actionButton = document.createElement('div');
                actionButton.classList = 'context-menu-button';
                actionButton.innerText = action.label;
                actionButton.addEventListener('click', function() {
                    action.onselect();
                    removeContextMenuElement(true);
                });

                contextMenuElement.appendChild(actionButton);
            }
            if (additionalActions.length) {
                let contextMenuSeparatorElement = document.createElement('div');
                contextMenuSeparatorElement.classList = 'context-menu-separator';
                
                contextMenuElement.appendChild(contextMenuSeparatorElement);
            }

            let addChatButton = document.createElement('div');
            addChatButton.classList = 'context-menu-button';
            addChatButton.innerText = 'Add chat';
            addChatButton.addEventListener('click', function() {
                buildAddChatMenu();
                removeContextMenuElement(true);
            });

            let exitAccountButton = document.createElement('div');
            exitAccountButton.classList = 'context-menu-button';
            exitAccountButton.innerText = 'Exit account';
            exitAccountButton.addEventListener('click', exitAccount);

        contextMenuElement.appendChild(addChatButton);
        contextMenuElement.appendChild(exitAccountButton);

        document.body.appendChild(contextMenuElement);

        function removeContextMenuElement(e) {
            if (e === true || !e.composedPath().includes(contextMenuElement)) {
                try {
                    document.body.removeChild(contextMenuElement);
                } catch {}
                document.body.removeEventListener('click', removeContextMenuElement);
            }
        }
        document.body.addEventListener('click', removeContextMenuElement);
    }

    function buildMessageContextMenu(x, y, chatId, messageId, senderId) {
        let oldContextMenuElement = document.getElementById('context-menu');
        if (oldContextMenuElement) {
            document.body.removeChild(oldContextMenuElement);
        }
        
        let contextMenuElement = document.createElement('div');
        contextMenuElement.id = 'context-menu';
        contextMenuElement.style.left = `${x}px`;
        contextMenuElement.style.top = `${y}px`;

            if (senderId == activeUserId || activeChatOwnerId == activeUserId) {
                let deleteMessageButton = document.createElement('div');
                deleteMessageButton.classList = 'context-menu-button';
                deleteMessageButton.innerText = 'Delete message';
                deleteMessageButton.addEventListener('click', function() {
                    deleteMessages(chatId, [messageId]);
                    removeContextMenuElement(true);
                });

                contextMenuElement.appendChild(deleteMessageButton);
            }

        document.body.appendChild(contextMenuElement);

        function removeContextMenuElement(e) {
            if (e === true || !e.composedPath().includes(contextMenuElement)) {
                try {
                    document.body.removeChild(contextMenuElement);
                } catch {}
                document.body.removeEventListener('click', removeContextMenuElement);
            }
        }
        document.body.addEventListener('click', removeContextMenuElement);
    }

    function sendMessage(chatId, text, attachments) {
        return fetch('/sendMessage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': accessKey
            },
            body: JSON.stringify({
                chatId: chatId,
                text: text,
                attachments: attachments
            })
        });
    }

    async function getUser(userId) {
        let response = await fetch(`/getUser?id=${userId}`, {
            method: 'GET',
            headers: {
                'Authorization': accessKey
            }
        });
        let parsed = await response.json();
        if (parsed.error) {
            throw parsed;
        }
        return parsed.user;
    }

    async function getChat(chatId) {
        let response = await fetch(`/getChat?id=${chatId}`, {
            method: 'GET',
            headers: {
                'Authorization': accessKey
            }
        });
        let parsed = await response.json();
        if (parsed.error) {
            throw parsed
        }
        return parsed.chat;
    }

    async function enterChat(chatName, chatPassword) {
        let response = await fetch(`/enterChat`, {
            method: 'POST',
            headers: {
                'Authorization': accessKey
            },
            body: JSON.stringify({
                chatName, chatPassword
            })
        });
        let parsed = await response.json();
        if (parsed.error) {
            throw parsed;
        }
        return parsed.chat;
    }

    async function createChat(chatName, chatPassword) {
        let response = await fetch(`/createChat`, {
            method: 'POST',
            headers: {
                'Authorization': accessKey
            },
            body: JSON.stringify({
                chatName, chatPassword
            })
        });
        let parsed = await response.json();
        if (parsed.error) {
            throw parsed;
        }
        return parsed.chat;
    }

    async function leaveChat(chatId) {
        let response = await fetch(`/leaveChat`, {
            method: 'POST',
            headers: {
                'Authorization': accessKey
            },
            body: JSON.stringify({
                chatId
            })
        });
        let parsed = await response.json();
        if (parsed.error) {
            throw parsed;
        }
        return parsed.success;
    }

    async function deleteMessages(chatId, messageIds) {
        let response = await fetch(`/deleteMessages`, {
            method: 'POST',
            headers: {
                'Authorization': accessKey
            },
            body: JSON.stringify({
                chatId: parseInt(chatId),
                messageIds: messageIds.map(id => parseInt(id))
            })
        });
        let parsed = await response.json();
        if (parsed.error) {
            throw parsed;
        }
        return parsed.success;
    }

    async function getAttachment(hash) {
        let response = await fetch(`/attachment?hash=${hash}`);
        return await response.blob();
    }

    function deleteCookie(cookieName) {
        document.cookie = `${cookieName}=; expires = Thu, 01 Jan 1970 00:00:00 GMT`
    }

    async function exitAccount() {
        deleteCookie('authorized');
        location.replace('/');
    }
}

window.onload = chatsPageScript;

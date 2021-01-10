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

function connectToLiveUpdates(accessKey) {
    return new Promise((resolve, reject) => {
        let ws = new WebSocket('ws://' + location.hostname + '/liveUpdates');
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

    let messageInput = document.getElementById('message-input');
    
    let workingWithSubPanel = false;
    let loadingMessages = false;
    let cachedUsers = new Map;
    let accessKey = localStorage.getItem('accessKey');

    let activeChat = null;
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
        if (activeChat == newMessage.chatId) appendNewMessage(newMessage);
        notify(newMessage.chatId);
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
    messageInput.addEventListener('keypress', async function(e) {
        if (this.innerText.length >= 2048) {
            e.preventDefault();
        }
        if (e.code == 'Enter' && !e.shiftKey) {
            e.preventDefault();
            let trimmedMessageText = this.innerText.trim();
            if (trimmedMessageText != '') {
                if (!sendingMessage) {
                    sendingMessage = true;
                    try {
                        let response = await sendMessage(activeChat, trimmedMessageText);
                        let responseData = await response.json();
                        if (responseData.error) {
                            throw responseData.error;
                        }
                    } catch (e) {
                        console.log('Error sending message.', e);
                    }
                    sendingMessage = false;
                    this.innerText = '';
                }
            }
        }
    });
    messageInput.addEventListener('input', async function(e) {
        if (this.innerText.length >= 2048) {
            this.innerText = this.innerText.slice(0, 2048);
            console.log(this.scrollHeight);
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

        let oldChatContents = document.getElementById('chat-contents');
        let chatContents = document.createElement('div');
        chatContents.id = 'chat-contents';
        chatContents.innerHTML = '';

        chatContainer.dataset.chatId = chat.id;
        chatContainer.replaceChild(chatContents, oldChatContents);

        activeChat = chat.id;

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
                    loadMessages(activeChat, offset, 20, true);
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
                    loadMessages(activeChat, offset, 20, true);
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

                let rightMessagesStretchPart = document.createElement('div');
                rightMessagesStretchPart.classList = 'right-messages-stretch-part';

                    let senderUsernameElement = document.createElement('div');
                    senderUsernameElement.classList = 'sender-username';
                    senderUsernameElement.innerText = messages[messageItr1].senderUsername;
                
                    let messagesBodyElement = document.createElement('div');
                    messagesBodyElement.classList = 'messages-body';
                    for (
                        let messageItr2 = messageItr1;
                        messageItr2 < messages.length && messages[messageItr2].senderId == messages[messageItr1].senderId;
                        messageItr2++
                    ) {
                        if (!cachedUsers.get(messages[messageItr2].senderId)) {
                            cachedUsers.set(messages[messageItr2].senderId, messages[messageItr2].senderUsername);
                        }
                        let messageElement = document.createElement('div');
                        messageElement.classList = 'message';
                        messageElement.innerText = messages[messageItr2].text;
                        messageElement.dataset.chatId = messages[messageItr2].chatId;
                        messageElement.dataset.messageId = messages[messageItr2].id;
                        
                        messagesBodyElement.insertAdjacentElement('afterbegin', messageElement);
                        messageItr1 = messageItr2;
                    }

                rightMessagesStretchPart.appendChild(senderUsernameElement);
                rightMessagesStretchPart.appendChild(messagesBodyElement);

            messagesStretchElement.appendChild(avatarElement);
            messagesStretchElement.appendChild(rightMessagesStretchPart);

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
                if (activeChat != chatId) {
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

        if (lastMessagesStretch && (+lastMessagesStretch.dataset.senderId == newMessage.senderId)) {
                let messagesBody = lastMessagesStretch.getElementsByClassName('messages-body')[0];

                let messageElement = document.createElement('div');
                messageElement.classList = 'message';
                messageElement.innerText = newMessage.text;
                messageElement.dataset.chatId = newMessage.chatId;
                messageElement.dataset.messageId = newMessage.messageId;

                messagesBody.appendChild(messageElement);
        }else {
                let messagesStretchElement = document.createElement('div');
                messagesStretchElement.classList = 'messages-stretch';
                messagesStretchElement.dataset.senderId = newMessage.senderId;

                    let avatarElement = document.createElement('div');
                    avatarElement.classList = 'message-avatar';
                    avatarElement.innerText = senderUsername ? senderUsername[0].toUpperCase() : '#';

                    let rightMessagesStretchPart = document.createElement('div');
                    rightMessagesStretchPart.classList = 'right-messages-stretch-part';

                        let senderUsernameElement = document.createElement('div');
                        senderUsernameElement.classList = 'sender-username';
                        senderUsernameElement.innerText = senderUsername ?? 'Noname';

                        let messagesBodyElement = document.createElement('div');
                        messagesBodyElement.classList = 'messages-body';

                            let messageElement = document.createElement('div');
                            messageElement.classList = 'message';
                            messageElement.innerText = newMessage.text;
                            messageElement.dataset.chatId = newMessage.chatId;
                            messageElement.dataset.messageId = newMessage.messageId;

                        messagesBodyElement.appendChild(messageElement);

                    rightMessagesStretchPart.appendChild(senderUsernameElement);
                    rightMessagesStretchPart.appendChild(messagesBodyElement);

                messagesStretchElement.appendChild(avatarElement);
                messagesStretchElement.appendChild(rightMessagesStretchPart);

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

            let chatContents = document.getElementById('chat-contents');
            let currentPositionMessage = document.getElementsByClassName('message')[0];

            for (let message of data.messages) {
                appendOldMessage(message);
                await delay(50);
            }

            // setTimeout(function() {currentPositionMessage.scrollIntoView()}, 200);
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
            if (+firstMessagesStretch.dataset.senderId == oldMessage.senderId) {
                let messagesBody = firstMessagesStretch.getElementsByClassName('messages-body')[0];

                let messageElement = document.createElement('div');
                messageElement.classList = 'message';
                messageElement.innerText = oldMessage.text;
                messageElement.dataset.chatId = oldMessage.chatId;
                messageElement.dataset.messageId = oldMessage.id;

                messagesBody.insertAdjacentElement('afterbegin', messageElement);
            } else {
                let messagesStretchElement = document.createElement('div');
                messagesStretchElement.classList = 'messages-stretch';
                messagesStretchElement.dataset.senderId = oldMessage.senderId;

                    let avatarElement = document.createElement('div');
                    avatarElement.classList = 'message-avatar';
                    avatarElement.innerText = senderUsername ? senderUsername[0].toUpperCase() : '#';

                    let rightMessagesStretchPart = document.createElement('div');
                    rightMessagesStretchPart.classList = 'right-messages-stretch-part';

                        let senderUsernameElement = document.createElement('div');
                        senderUsernameElement.classList = 'sender-username';
                        senderUsernameElement.innerText = senderUsername ?? 'Noname';

                        let messagesBodyElement = document.createElement('div');
                        messagesBodyElement.classList = 'messages-body';

                            let messageElement = document.createElement('div');
                            messageElement.classList = 'message';
                            messageElement.innerText = oldMessage.text;
                            messageElement.dataset.chatId = oldMessage.chatId;
                            messageElement.dataset.messageId = oldMessage.messageId;

                        messagesBodyElement.appendChild(messageElement);

                    rightMessagesStretchPart.appendChild(senderUsernameElement);
                    rightMessagesStretchPart.appendChild(messagesBodyElement);

                messagesStretchElement.appendChild(avatarElement);
                messagesStretchElement.appendChild(rightMessagesStretchPart);

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
        this.classList.add('active');

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

    function sendMessage(chatId, text) {
        return fetch('/sendMessage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': accessKey
            },
            body: JSON.stringify({
                chatId: chatId,
                text: text
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
}

window.onload = chatsPageScript;


window.hideElement = function hideElement(element, time = 300) {
    element.classList.add('hidden');
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
}

window.showElement = function showElement(element, time = 300) {
    element.classList.remove('hidden');
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
}

window.mainPageScript = function mainPageScript() {
    let storage = {};

    let menu = document.getElementById('menu');
    console.log(menu);
    let loginButton = document.getElementById('login-button');
    let registerButton = document.getElementById('register-button');

    async function buildMainMenu() {
        location.hash = '';
        console.log(2, menu);
        await hideElement(menu);

        menu.innerHTML = '';
        menu.classList = '';

        loginButton = document.createElement('button');
        loginButton.id = 'login-button';
        loginButton.classList = 'button';
        loginButton.innerText = 'Log In';

        registerButton = document.createElement('button');
        registerButton.id = 'register-button';
        registerButton.classList = 'button';
        registerButton.innerText = 'Register';

        loginButton.addEventListener('click', function() {
            // buildLoginMenu takes an argument and click's event conflicts with it
            buildLoginMenu();
        });
        registerButton.addEventListener('click', buildRegisterEnterUsernameMenu);

        menu.appendChild(loginButton);
        menu.appendChild(registerButton);

        await showElement(menu);
    }

    async function buildRegisterEnterUsernameMenu() {
        location.hash = 'register';
        await hideElement(menu);

        menu.innerHTML = '';
        menu.classList = 'relative';

        let backButton = document.createElement('div');
        backButton.id = 'back-button';
        backButton.innerHTML = '<img src="/assets/back-button.svg"></div>';
        backButton.addEventListener('click', buildMainMenu);

        let dialogContainer = document.createElement('div');
        dialogContainer.id = 'dialog-container';

            let prompt = document.createElement('p');
            prompt.id = 'prompt';
            prompt.innerText = 'Please, enter username:';
            
            let usernameInput = document.createElement('input');
            usernameInput.classList = 'credentials-input';
            usernameInput.id = 'register-input';
            usernameInput.placeholder = 'username';
            usernameInput.spellcheck = false;
            usernameInput.value = storage.username ?? '';

        dialogContainer.appendChild(prompt);
        dialogContainer.appendChild(usernameInput);

        let nextButton = document.createElement('div');
        nextButton.id = 'next-button';
        nextButton.classList = 'not-allowed';
        nextButton.innerHTML = '<img src="/assets/next-button.svg"></div>';
        
        function testInput(value) {
            if (/^[a-zA-Z0-9_-]{5,16}$/.test(value)) {
                nextButton.classList.remove('not-allowed');
                nextButton.addEventListener('click', buildRegisterEnterPasswordMenu);
                return true;
            } else {
                nextButton.classList.add('not-allowed');
                nextButton.removeEventListener('click', buildRegisterEnterPasswordMenu);
                return false;
            }
        }
        testInput(usernameInput.value);

        usernameInput.addEventListener('input', function() {
            storage.username = this.value;
            testInput(this.value);
        });
        
        usernameInput.addEventListener('keydown', function(e) {
            if (e.code == 'Enter') {
                if (testInput(this.value)) {
                    buildRegisterEnterPasswordMenu();
                }
            }
        });

        menu.appendChild(backButton);
        menu.appendChild(dialogContainer);
        menu.appendChild(nextButton);

        await showElement(menu);

        usernameInput.focus();
    }

    async function buildRegisterEnterPasswordMenu() {
        await hideElement(menu);
        if (!/^[a-zA-Z0-9_-]{5,16}$/.test(storage.username)) {
            buildRegisterEnterUsernameMenu();
            return;
        }

        menu.innerHTML = '';
        menu.classList = 'relative';

        let backButton = document.createElement('div');
        backButton.id = 'back-button';
        backButton.innerHTML = '<img src="/assets/back-button.svg"></div>';
        backButton.addEventListener('click', buildRegisterEnterUsernameMenu);

        let dialogContainer = document.createElement('div');
        dialogContainer.id = 'dialog-container';

            let prompt = document.createElement('p');
            prompt.id = 'prompt';
            prompt.innerText = 'Please, enter password:';
            
            let passwordInput = document.createElement('input');
            passwordInput.classList = 'credentials-input';
            passwordInput.id = 'register-input';
            passwordInput.placeholder = 'password';
            passwordInput.type = 'password';

        dialogContainer.appendChild(prompt);
        dialogContainer.appendChild(passwordInput);

        let nextButton = document.createElement('div');
        nextButton.id = 'next-button';
        nextButton.classList = 'not-allowed';
        nextButton.innerHTML = '<img src="/assets/next-button.svg"></div>';
        
        passwordInput.addEventListener('input', function() {
            storage.password = this.value;
            if (this.value.length >= 7 && this.value.length <= 32) {
                nextButton.classList.remove('not-allowed');
                nextButton.addEventListener('click', buildRegisterRepeatPasswordMenu);
            } else {
                nextButton.classList.add('not-allowed');
                nextButton.removeEventListener('click', buildRegisterRepeatPasswordMenu);
            }
        });

        passwordInput.addEventListener('keydown', function(e) {
            if (e.code == 'Enter') {
                if (this.value.length >= 7 && this.value.length <= 32) {
                    buildRegisterRepeatPasswordMenu();
                }
            }
        });

        menu.appendChild(backButton);
        menu.appendChild(dialogContainer);
        menu.appendChild(nextButton);

        await showElement(menu);
        passwordInput.focus();
    }

    async function buildRegisterRepeatPasswordMenu() {
        await hideElement(menu);

        menu.innerHTML = '';
        menu.classList = 'relative';

        let backButton = document.createElement('div');
        backButton.id = 'back-button';
        backButton.innerHTML = '<img src="/assets/back-button.svg"></div>';
        backButton.addEventListener('click', buildRegisterEnterPasswordMenu);

        let dialogContainer = document.createElement('div');
        dialogContainer.id = 'dialog-container';

            let prompt = document.createElement('p');
            prompt.id = 'prompt';
            prompt.innerText = 'Please, repeat password:';
            
            let passwordInput = document.createElement('input');
            passwordInput.classList = 'credentials-input';
            passwordInput.id = 'register-input';
            passwordInput.placeholder = 'password';
            passwordInput.type = 'password';

        dialogContainer.appendChild(prompt);
        dialogContainer.appendChild(passwordInput);

        let nextButton = document.createElement('div');
        nextButton.id = 'next-button';
        nextButton.classList = 'not-allowed';
        nextButton.innerHTML = '<img src="/assets/next-button.svg"></div>';
        
        passwordInput.addEventListener('input', function() {
            if (this.value == storage.password) {
                nextButton.classList.remove('not-allowed');
                nextButton.addEventListener('click', buildRegisterSubmitMenu);
            } else {
                nextButton.classList.add('not-allowed');
                nextButton.removeEventListener('click', buildRegisterSubmitMenu);
            }
        });

        passwordInput.addEventListener('keydown', function(e) {
            if (e.code == 'Enter') {
                if (this.value.length >= 7 && this.value.length <= 32) {
                    buildRegisterSubmitMenu();
                }
            }
        });

        menu.appendChild(backButton);
        menu.appendChild(dialogContainer);
        menu.appendChild(nextButton);

        await showElement(menu);
        passwordInput.focus();
    }

    async function buildRegisterSubmitMenu() {
        await hideElement(menu);

        menu.innerHTML = '';
        menu.classList = 'relative';

        let backButton = document.createElement('div');
        backButton.id = 'back-button';
        backButton.innerHTML = '<img src="/assets/back-button.svg"></div>';
        backButton.addEventListener('click', buildRegisterEnterPasswordMenu);

        let dialogContainer = document.createElement('div');
        dialogContainer.id = 'dialog-container';

            let prompt = document.createElement('p');
            prompt.id = 'prompt';
            prompt.innerHTML = `Submit registration for user <b>${storage.username}</b>`;
            
        dialogContainer.appendChild(prompt);

        let nextButton = document.createElement('div');
        nextButton.id = 'next-button';
        nextButton.innerHTML = '<img src="/assets/next-button-green.svg"></div>';
        nextButton.addEventListener('click', registerUser);

        let fakeInput = document.createElement('input');
        fakeInput.style.opacity = '0';
        fakeInput.addEventListener('keydown', function(e) {
            if (e.code == 'Enter') {
                registerUser();
            }
        });


        menu.appendChild(backButton);
        menu.appendChild(dialogContainer);
        menu.appendChild(nextButton);
        menu.appendChild(fakeInput);

        await showElement(menu);
        fakeInput.focus();
    }

    async function registerUser() {
        await hideElement(menu);
        
        menu.classList = '';
        menu.innerHTML = '<img src="/assets/preloader.svg">';

        await showElement(menu);

        let data = {};
        try {
            let response = await fetch('/registerUser', {
                method: 'POST',
                timeout: 25,
                body: JSON.stringify({
                    username: storage.username,
                    password: storage.password
                })
            });
    
            data = await response.json();
        } catch (err) {
            console.log(err);
            buildRegisterErrorMenu();
            return;
        }
        
        console.log(data);
        if (data.registerSuccess) {
            buildRegisterSuccessMenu();
        } else {
            buildRegisterErrorMenu(data.error);
        }
    }

    async function buildRegisterErrorMenu(errorMessage) {
        await hideElement(menu);

        menu.classList = 'row-flex';
        menu.innerHTML = '';

        let leftBlock = document.createElement('div');
        leftBlock.id = 'dialog-container';

            let infoMessage = document.createElement('p');
            infoMessage.id = 'info-message';
            infoMessage.innerHTML = errorMessage || 'You haven\'t been registered';

            let goHomeButton = document.createElement('button');
            goHomeButton.classList = 'button';
            goHomeButton.id = 'go-home-button';
            goHomeButton.innerText = 'Go Home';
            goHomeButton.addEventListener('click', buildMainMenu);

            let goBackButton = document.createElement('button');
            goBackButton.classList = 'button';
            goBackButton.id = 'go-back-button';
            goBackButton.innerText = 'Go Back';
            goBackButton.addEventListener('click', buildRegisterEnterUsernameMenu);

        leftBlock.appendChild(infoMessage);
        leftBlock.appendChild(goHomeButton);
        leftBlock.appendChild(goBackButton);

        let statusIcon = document.createElement('div');
        statusIcon.innerHTML = '<img src="/assets/register-error.svg">';

        menu.appendChild(leftBlock);
        menu.appendChild(statusIcon);

        await showElement(menu);
    }

    async function buildRegisterSuccessMenu() {
        await hideElement(menu);

        menu.classList = 'row-flex';
        menu.innerHTML = '';

        let leftBlock = document.createElement('div');
        leftBlock.id = 'dialog-container';

            let infoMessage = document.createElement('p');
            infoMessage.id = 'info-message';
            infoMessage.innerHTML = 'You have been registered';

            let goHomeButton = document.createElement('button');
            goHomeButton.classList = 'button';
            goHomeButton.id = 'go-home-button';
            goHomeButton.innerText = 'Go Home';
            goHomeButton.addEventListener('click', buildMainMenu);

        leftBlock.appendChild(infoMessage);
        leftBlock.appendChild(goHomeButton);

        let statusIcon = document.createElement('div');
        statusIcon.innerHTML = '<img src="/assets/register-success.svg">';

        menu.appendChild(leftBlock);
        menu.appendChild(statusIcon);

        await showElement(menu);
    }

    async function buildLoginMenu(errorMessage) {
        location.hash = 'login';
        await hideElement(menu);

        menu.innerHTML = '';
        menu.classList = 'relative';

        let backButton = document.createElement('div');
        backButton.id = 'back-button';
        backButton.innerHTML = '<img src="/assets/back-button.svg"></div>';
        backButton.addEventListener('click', buildMainMenu);

        let dialogContainer = document.createElement('div');
        dialogContainer.id = 'dialog-container';
        dialogContainer.classList = 'upper';
            
            let errorMessageElement;
            if (errorMessage) {
                errorMessageElement = document.createElement('p');
                errorMessageElement.id = 'info-message';
                errorMessageElement.innerText = errorMessage;
            }

            let usernameInput = document.createElement('input');
            usernameInput.classList = 'credentials-input';
            usernameInput.id = 'login-username-input';
            usernameInput.placeholder = 'username';
            usernameInput.spellcheck = false;
            usernameInput.value = storage.username ?? '';
            if (storage.username) {
                usernameInput.value = storage.username;
            }

            let passwordInput = document.createElement('input');
            passwordInput.classList = 'credentials-input';
            passwordInput.id = 'login-password-input';
            passwordInput.placeholder = 'password';
            passwordInput.type = 'password';
            passwordInput.spellcheck = false;

        if (errorMessageElement) {
            dialogContainer.appendChild(errorMessageElement);
        }
        dialogContainer.appendChild(usernameInput);
        dialogContainer.appendChild(passwordInput);

        let nextButton = document.createElement('div');
        nextButton.id = 'next-button';
        nextButton.classList = 'not-allowed';
        nextButton.innerHTML = '<img src="/assets/next-button.svg"></div>';
        
        function testInputs(username, password) {
            isUsernameCorrect = /^[a-zA-Z0-9_-]{5,16}$/.test(username);
            isPasswordCorrect = password.length >= 7 && password.length <= 32;
            if (isUsernameCorrect && isPasswordCorrect) {
                nextButton.classList.remove('not-allowed');
                nextButton.addEventListener('click', loginUser);
                return true;
            } else {
                nextButton.classList.add('not-allowed');
                nextButton.removeEventListener('click', loginUser);
                return false;
            }
        }

        usernameInput.addEventListener('input', function() {
            storage.username = this.value;
            testInputs(usernameInput.value, passwordInput.value);
        });
        
        usernameInput.addEventListener('keydown', function(e) {
            if (e.code == 'Tab') {
                e.preventDefault();
                passwordInput.focus();
            } else if (e.code == 'Enter') {
                e.preventDefault();
                if (passwordInput.value.length == 0) {
                    passwordInput.focus();
                } else {
                    if (testInputs(usernameInput.value, passwordInput.value)) {
                        loginUser();
                    }
                }
            }
        });

        passwordInput.addEventListener('input', function() {
            storage.password = this.value;
            testInputs(usernameInput.value, passwordInput.value);
        });

        passwordInput.addEventListener('keydown', function(e) {
            if (e.code == 'Tab') {
                e.preventDefault();
                usernameInput.focus();
            } else if (e.code == 'Enter') {
                e.preventDefault();
                if (testInputs(usernameInput.value, passwordInput.value)) {
                    loginUser();
                }
            }
        });

        menu.appendChild(backButton);
        menu.appendChild(dialogContainer);
        menu.appendChild(nextButton);

        await showElement(menu);

        usernameInput.focus();
    }

    async function loginUser() {
        await hideElement(menu);
        
        menu.classList = '';
        menu.innerHTML = '<img src="/assets/preloader.svg">';

        await showElement(menu);

        let data = {};
        try {
            let response = await fetch('/auth', {
                method: 'POST',
                timeout: 25,
                body: JSON.stringify({
                    username: storage.username,
                    password: storage.password
                })
            });
    
            data = await response.json();
        } catch (err) {
            console.log(err);
            buildLoginMenu("Internal server error");
            return;
        }
        
        if (data.accessKey) {
            localStorage.setItem('accessKey', data.accessKey);
            localStorage.setItem('deathTs', data.deathTs);

            await hideElement(menu);
            // location.replace('/chats');
            enterAccount()
        } else {
            buildLoginMenu(data.error);
        }
    }
    
    if (location.hash == '#login') {
        buildLoginMenu();
    } else if (location.hash == '#register') {
        buildRegisterEnterUsernameMenu();
    } else {
        buildMainMenu();
    }

    window.addEventListener('popstate', function(e) {
        if (location.hash == '#login') {
            buildLoginMenu();
        } else if (location.hash == '#register') {
            buildRegisterEnterUsernameMenu();
        } else {
            buildMainMenu();
        }
    });

    async function enterAccount() {
        let preloader = document.getElementById('preloader');
        preloader.classList.add('prepared');
        await showElement(preloader);

        let container = document.getElementById('container');
        container.innerHTML =
            '<div id="chats-panel">' +
                '<div class="chat-button" id="add-chat-button">+</div>' +
            '</div>' +
            '<div id="sub-panel" class="no"></div>' +
            '<div id="chat-container">' +
                '<div id="chat-header">' +
                    '<div id="chat-title">' +
                        '<div id="chat-name"></div>' +
                        '<div id="members">' +
                            '<span id="members-count"></span> Members' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div id="plug"></div>' +
                '<div id="chat-contents"></div>' +
                '<div class="not-touched" id="message-input" contenteditable="true">Start typing message...</div>' +
            '</div>';

        document.head.removeChild(document.getElementById('stylesheet'));
        let stylesheet = document.createElement('link');
        stylesheet.id = 'stylesheet';
        stylesheet.rel = 'stylesheet';
        stylesheet.href = '/css/chatsStyle.css';
        document.head.appendChild(stylesheet);
        stylesheet.onload = function() {
            document.body.removeAttribute('style');
        };

        document.head.removeChild(document.getElementById('script'));
        let script = document.createElement('script');
        script.id = 'script';
        script.src = '/js/chatsMain.js';
        document.head.appendChild(script);
        script.onload = function() {
            location.hash = '';
            window.chatsPageScript();
        };
    }
}

window.onload = mainPageScript;


package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"./database"

	_ "github.com/go-sql-driver/mysql"
	ws "github.com/gorilla/websocket"
)

func handleRequest(response http.ResponseWriter, request *http.Request) {
	if request.Method != "GET" {
		return
	}

	authorizedCookie, err := request.Cookie("authorized")
	authorized := true
	if err != nil {
		authorized = false
	} else {
		deathTs, err := strconv.Atoi(authorizedCookie.Value)
		if err != nil {
			authorized = false
		}
		if deathTs < int(time.Now().Unix()) {
			authorized = false
		}
	}

	if (request.URL.Path == "/" || request.URL.Path == "/index.html") && authorized {
		http.Redirect(response, request, "/chats", http.StatusTemporaryRedirect)
	} else if request.URL.Path == "/chats" && !authorized {
		http.Redirect(response, request, "/", http.StatusTemporaryRedirect)
	} else if request.URL.Path == "/" || request.URL.Path == "/index.html" {
		html, err := ioutil.ReadFile("content/html/index.html")
		if err != nil {
			http.Error(response, `404 NOT FOUND`, http.StatusNotFound)
		}
		response.Write(html)
	} else if request.URL.Path == "/chats" {
		html, err := ioutil.ReadFile("content/html/chats.html")
		if err != nil {
			http.Error(response, `404 NOT FOUND`, http.StatusNotFound)
		}
		response.Write(html)
	} else {
		http.Error(response, `404 NOT FOUND`, http.StatusNotFound)
	}
}

func handleRegisterUser(response http.ResponseWriter, request *http.Request) {
	if request.Method != "POST" {
		io.WriteString(response, `{"error":"Wrong method"}`)
		return
	}

	decoder := json.NewDecoder(request.Body)
	var data struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	err := decoder.Decode(&data)
	if err != nil {
		io.WriteString(response, `{"error":"Can't parse json"}`)
		return
	}

	validUsername := regexp.MustCompile(`^[a-zA-Z0-9_-]{5,16}$`)
	if !validUsername.MatchString(data.Username) {
		io.WriteString(response, `{"error":"Invalid username"}`)
		return
	}

	passwordLength := len(data.Password)
	if passwordLength < 7 || passwordLength > 32 {
		io.WriteString(response, `{"error":"Invalid password length"}`)
		return
	}

	db, err := openSqlConnection()
	if err != nil {
		io.WriteString(response, `{"error":"Server internal error"}`)
	}

	_, err = db.RegisterUser(data.Username, data.Password)
	if err != nil {
		io.WriteString(response, `{"error":"Username already taken"}`)
		return
	}

	io.WriteString(response, `{"registerSuccess":true}`)
}

func handleAuth(response http.ResponseWriter, request *http.Request) {
	if request.Method != "POST" {
		io.WriteString(response, `{"error":"Wrong method"}`)
		return
	}

	decoder := json.NewDecoder(request.Body)
	var data struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	err := decoder.Decode(&data)
	if err != nil {
		io.WriteString(response, `{"error":"Can't parse json"}`)
		return
	}

	db, err := openSqlConnection()
	if err != nil {
		io.WriteString(response, `{"error":"Internal server error"}`)
		return
	}
	defer db.Close()

	accessKey, deathTs, err := db.CreateAccessKey(data.Username, data.Password)
	if err != nil {
		io.WriteString(response, fmt.Sprintf(`{"error":"%s"}`, err.Error()))
		return
	}

	cookie := &http.Cookie{
		Name:    "authorized",
		Value:   strconv.Itoa(deathTs),
		Expires: time.Now().Add(time.Hour * 24),
	}
	http.SetCookie(response, cookie)
	io.WriteString(response, fmt.Sprintf(`{"accessKey":"%s","deathTs":%d}`, accessKey, deathTs))
}

func checkAccessKey(response http.ResponseWriter, request *http.Request) (database.DB, bool, int) {
	accessKey := request.Header.Get("Authorization")

	db, err := openSqlConnection()
	if err != nil {
		io.WriteString(response, `{"error":"Server internal error"}`)
		return db, false, 0
	}

	authorized, userId := db.ValidateAccessKey(accessKey)

	if !authorized {
		cookie := &http.Cookie{
			Name:    "authorized",
			Expires: time.Unix(0, 0),
		}
		http.SetCookie(response, cookie)
		io.WriteString(response, `{"error":"Invalid access key","errorCode":1}`)
		db.Close()
	}

	return db, authorized, userId
}

func handleGetMe(response http.ResponseWriter, request *http.Request) {
	if request.Method != "GET" {
		io.WriteString(response, `{"error":"Wrong method"}`)
		return
	}

	db, authorized, userId := checkAccessKey(response, request)
	if !authorized {
		return
	}
	defer db.Close()

	/* I know this "exists" may be useless,
	 * but what if user asynchronously deleted after checking accessKey?
	 */
	user, exists := db.GetUser(userId)
	if !exists {
		io.WriteString(response, `{"error":"User not found"}`)
		return
	}

	io.WriteString(response, fmt.Sprintf(`{"user":{"id":%d,"username":"%s","registerTs":%d}}`, user.Id, user.Username, user.RegisterTs))
}

func handleGetUser(response http.ResponseWriter, request *http.Request) {
	if request.Method != "GET" {
		io.WriteString(response, `{"error":"Wrong method"}`)
		return
	}

	db, authorized, _ := checkAccessKey(response, request)
	if !authorized {
		return
	}
	defer db.Close()

	userIdString := request.URL.Query().Get("id")
	if userIdString == "" {
		io.WriteString(response, `{"error":"No parameter \"id\" specified"}`)
		return
	}

	userId, err := strconv.Atoi(userIdString)
	if err != nil {
		io.WriteString(response, `{"error":"Invalid parameter \"id\" specified"}`)
		return
	}

	user, exists := db.GetUser(userId)
	if !exists {
		io.WriteString(response, `{"error":"User not found"}`)
		return
	}

	io.WriteString(response, fmt.Sprintf(`{"user":{"id":%d,"username":"%s","registerTs":%d}}`, user.Id, user.Username, user.RegisterTs))
}

func handleGetChats(response http.ResponseWriter, request *http.Request) {
	if request.Method != "GET" {
		io.WriteString(response, `{"error":"Wrong method"}`)
		return
	}

	db, authorized, userId := checkAccessKey(response, request)
	if !authorized {
		return
	}

	chats, err := db.GetUserChats(userId)
	if err != nil {
		io.WriteString(response, `{"error":"Server interval error"}`)
	}

	var result struct {
		Chats []database.Chat `json:"chats"`
	}
	result.Chats = chats

	jsonEncoder := json.NewEncoder(response)
	jsonEncoder.Encode(result)
}

func handleGetChat(response http.ResponseWriter, request *http.Request) {
	if request.Method != "GET" {
		io.WriteString(response, `{"error":"Wrong method"}`)
		return
	}

	db, authorized, userId := checkAccessKey(response, request)
	if !authorized {
		return
	}
	defer db.Close()

	chatId, err := strconv.Atoi(request.URL.Query().Get("id"))
	if err != nil {
		io.WriteString(response, `{"error":"Incorrect chatId"}`)
		return
	}

	var responseStruct struct {
		Chat database.ChatInformation `json:"chat"`
	}
	chat, err := db.GetChat(userId, chatId, true, true)
	if err != nil {
		log.Println(err)
		io.WriteString(response, `{"error":"Access denied"}`)
		return
	}
	responseStruct.Chat = *chat

	jsonEncoder := json.NewEncoder(response)
	jsonEncoder.Encode(responseStruct)
}

func handleSendMessage(response http.ResponseWriter, request *http.Request) {
	if request.Method != "POST" {
		io.WriteString(response, `{"error":"Wrong method"}`)
		return
	}

	db, authorized, userId := checkAccessKey(response, request)
	if !authorized {
		return
	}
	defer db.Close()

	var params struct {
		ChatId *int    `json:"chatId"`
		Text   *string `json:"text"`
	}
	decoder := json.NewDecoder(request.Body)
	err := decoder.Decode(&params)
	if err != nil {
		io.WriteString(response, `{"error":"Invalid request body"}`)
	}

	if params.ChatId == nil || params.Text == nil {
		io.WriteString(response, `{"error":"Incorrect params"}`)
		return
	}
	*params.Text = strings.TrimSpace(*params.Text)
	if *params.Text == "" || len(*params.Text) > 2048 {
		io.WriteString(response, `{"error":"Incorrect text param"}`)
	}

	messageId, err := db.AddMessage(*params.ChatId, userId, *params.Text)
	if err != nil {
		io.WriteString(response, fmt.Sprintf(`{"error":"%s"}`, err.Error()))
		return
	}

	io.WriteString(response, fmt.Sprintf(`{"messageId":%d}`, messageId))

	if eventBus, exists := eventBus.Chats[*params.ChatId]; exists {
		eventBus.Mutex.Lock()

		var message struct {
			Event     string `json:"event"`
			EventData struct {
				ChatId    int    `json:"chatId"`
				MessageId int    `json:"messageId"`
				SenderId  int    `json:"senderId"`
				Text      string `json:"text"`
				Ts        int    `json:"ts"`
			} `json:"eventData"`
		}
		message.Event = "newMessage"
		message.EventData.ChatId = *params.ChatId
		message.EventData.MessageId = messageId
		message.EventData.SenderId = userId
		message.EventData.Text = *params.Text
		message.EventData.Ts = int(time.Now().Unix())
		jsonMessage, err := json.Marshal(message)
		if err != nil {
			log.Println(err)
			return
		}

		wg := sync.WaitGroup{}
		for _, subscriber := range eventBus.Sockets {
			wg.Add(1)
			go func(subscriber *ws.Conn) {
				subscriber.WriteMessage(ws.TextMessage, jsonMessage)
				wg.Done()
			}(subscriber)
		}
		wg.Wait()

		eventBus.Mutex.Unlock()
	}
}

func handleGetMessages(response http.ResponseWriter, request *http.Request) {
	if request.Method != "GET" {
		io.WriteString(response, `{"error":"Wrong method"}`)
		return
	}

	db, authorized, userId := checkAccessKey(response, request)
	if !authorized {
		return
	}
	defer db.Close()

	chatIdString := request.URL.Query().Get("chatId")
	chatId, err := strconv.Atoi(chatIdString)
	if err != nil {
		io.WriteString(response, `{"error":"Invalid \"chatId\" parameter"}`)
		return
	}

	userInChat := db.IsUserInChat(userId, chatId)
	if !userInChat {
		io.WriteString(response, `{"error":"Access denied"}`)
		return
	}

	offsetString := request.URL.Query().Get("offset")
	offset, err := strconv.Atoi(offsetString)
	if err != nil {
		io.WriteString(response, `{"error":"Invalid \"offset\" parameter"}`)
		return
	}

	messagesCountString := request.URL.Query().Get("messagesCount")
	messagesCount := 20
	if messagesCountString != "" {
		messagesCount, err = strconv.Atoi(messagesCountString)
		if err != nil {
			io.WriteString(response, `{"error":"Invalid \"messagesCount\" parameter"}`)
			return
		}
	}

	withUsernamesString := request.URL.Query().Get("withUsernames")
	withUsernames := false
	if withUsernamesString == "true" {
		withUsernames = true
	}

	messages, err := db.GetMessages(chatId, offset, messagesCount, withUsernames)
	if err != nil {
		io.WriteString(response, `{"error":"Interval Server Error"}`)
		return
	}

	var responseStruct struct {
		Messages []database.Message `json:"messages"`
	}
	responseStruct.Messages = messages

	jsonString, err := json.Marshal(responseStruct)
	if err != nil {
		io.WriteString(response, `{"error":"Interval Server Error"}`)
		return
	}

	response.Write(jsonString)
}

func handleEnterChat(response http.ResponseWriter, request *http.Request) {
	if request.Method != "POST" {
		io.WriteString(response, `{"error":"Wrong method"}`)
		return
	}

	db, authorized, userId := checkAccessKey(response, request)
	if !authorized {
		return
	}
	defer db.Close()

	var credentials struct {
		ChatName     string `json:"chatName"`
		ChatPassword string `json:"chatPassword"`
	}
	jsonDecoder := json.NewDecoder(request.Body)
	err := jsonDecoder.Decode(&credentials)
	if err != nil {
		io.WriteString(response, `{"error":"Can't parse json"}`)
		return
	}

	chatId, err := db.EnterChat(userId, credentials.ChatName, credentials.ChatPassword)
	if err != nil {
		io.WriteString(response, fmt.Sprintf(`{"error":"%s"}`, err.Error()))
		return
	}

	chat, err := db.GetChat(userId, chatId, true, true)
	if err != nil {
		io.WriteString(response, `{"error":"Internal Server Error"}`)
		return
	}

	responseStruct := struct {
		Chat database.ChatInformation `json:"chat"`
	}{*chat}

	jsonEncoder := json.NewEncoder(response)
	jsonEncoder.Encode(responseStruct)
}

func handleCreateChat(response http.ResponseWriter, request *http.Request) {
	if request.Method != "POST" {
		io.WriteString(response, `{"error":"Wrong method"}`)
		return
	}

	db, authorized, userId := checkAccessKey(response, request)
	if !authorized {
		return
	}
	defer db.Close()

	var credentials struct {
		ChatName     string `json:"chatName"`
		ChatPassword string `json:"chatPassword"`
	}
	jsonDecoder := json.NewDecoder(request.Body)
	err := jsonDecoder.Decode(&credentials)
	if err != nil {
		io.WriteString(response, `{"error":"Can't parse json"}`)
		return
	}

	validChatName := regexp.MustCompile(`^[a-zA-Z0-9_-]{5,16}$`)
	if !validChatName.MatchString(credentials.ChatName) {
		io.WriteString(response, `{"error":"Invalid chat name"}`)
		return
	}

	passwordLength := len(credentials.ChatPassword)
	if passwordLength > 32 {
		io.WriteString(response, `{"error":"Invalid password length"}`)
		return
	}

	chatId, err := db.CreateChat(userId, credentials.ChatName, credentials.ChatPassword)
	if err != nil {
		io.WriteString(response, `{"error":"Chat name already taken"}`)
		return
	}

	chat, err := db.GetChat(userId, chatId, true, true)
	if err != nil {
		io.WriteString(response, `{"error":"Server Internal Error"}`)
		return
	}

	responseStruct := struct {
		Chat database.ChatInformation `json:"chat"`
	}{*chat}

	jsonEncoder := json.NewEncoder(response)
	jsonEncoder.Encode(responseStruct)
}

func handleDeleteMessages(response http.ResponseWriter, request *http.Request) {
	if request.Method != "POST" {
		io.WriteString(response, `{"error":"Wrong method"}`)
		return
	}

	db, authorized, userId := checkAccessKey(response, request)
	if !authorized {
		return
	}
	defer db.Close()
	log.Println("user", userId)

	var dataStruct struct {
		ChatId     int   `json:"chatId"`
		MessageIds []int `json:"messageIds"`
	}
	jsonDecoder := json.NewDecoder(request.Body)
	err := jsonDecoder.Decode(&dataStruct)
	if err != nil {
		log.Println(err)
		io.WriteString(response, `{"error":"Can't parse json"}`)
		return
	}
	log.Println("data", dataStruct)

	deletedMessageIds := []int{}
	responseSent := false
	for _, messageId := range dataStruct.MessageIds {
		log.Println("deleteting", messageId)
		message, err := db.GetMessage(dataStruct.ChatId, messageId)
		if err != nil {
			log.Println(err)
			responseSent = true
			io.WriteString(response, `{"error":"Message not found"}`)
			break
		}

		if message.SenderId != userId {
			var chat *database.ChatInformation
			chat, err = db.GetChat(userId, dataStruct.ChatId, false, false)
			if err != nil {
				log.Println(err)
				responseSent = true
				io.WriteString(response, `{"error":"Chat not found"}`)
				break
			}
			if chat.OwnerId != userId {
				log.Println(err)
				responseSent = true
				io.WriteString(response, `{"error":"Access denied"}`)
				break
			}
		}

		err = db.DeleteMessage(dataStruct.ChatId, messageId)
		if err != nil {
			log.Println(err)
			responseSent = true
			io.WriteString(response, `{"error":"Server Internal Error"}`)
			break
		}
		deletedMessageIds = append(deletedMessageIds, messageId)
	}
	log.Println("response sent -", responseSent)

	if !responseSent {
		responseStruct := struct {
			Success bool `json:"success"`
		}{true}

		encoder := json.NewEncoder(response)
		encoder.Encode(responseStruct)
	}

	if eventBus, exists := eventBus.Chats[dataStruct.ChatId]; exists {
		eventBus.Mutex.Lock()

		var message struct {
			Event     string `json:"event"`
			EventData struct {
				ChatId            int   `json:"chatId"`
				DeletedMessageIds []int `json:"deletedMessageIds"`
			} `json:"eventData"`
		}
		message.Event = "messagesDeleted"
		message.EventData.ChatId = dataStruct.ChatId
		message.EventData.DeletedMessageIds = deletedMessageIds
		jsonMessage, err := json.Marshal(message)
		if err != nil {
			log.Println(err)
			return
		}
		log.Println("message", message)

		wg := sync.WaitGroup{}
		for _, subscriber := range eventBus.Sockets {
			wg.Add(1)
			go func(subscriber *ws.Conn) {
				subscriber.WriteMessage(ws.TextMessage, jsonMessage)
				wg.Done()
			}(subscriber)
		}
		wg.Wait()

		eventBus.Mutex.Unlock()
	}
}

var upgrader = ws.Upgrader{
	ReadBufferSize:  512,
	WriteBufferSize: 512,
}

var connections = make(map[*ws.Conn]database.DB)

type subEventBus struct {
	Mutex   sync.Mutex
	Sockets []*ws.Conn
}

func (seb *subEventBus) deleteSubscription(i int) {
	seb.Sockets[i] = seb.Sockets[len(seb.Sockets)-1]
	seb.Sockets = seb.Sockets[:len(seb.Sockets)-1]
}

var eventBus struct {
	Chats map[int]*subEventBus
}

func handleLiveUpdates(response http.ResponseWriter, request *http.Request) {
	socket, err := upgrader.Upgrade(response, request, nil)
	if err != nil {
		log.Println("Upgrade error", err)
		return
	}
	defer socket.Close()

	db, err := openSqlConnection()
	if err != nil {
		log.Println(err)
		socket.WriteMessage(ws.TextMessage, []byte(`{"error":"Server internal error"}`))
		return
	}

	connections[socket] = db

	socket.SetCloseHandler(func(code int, text string) error {
		db, exists := connections[socket]
		if exists {
			db.Close()
		}
		delete(connections, socket)
		for chatId, chatEventBus := range eventBus.Chats {
			chatEventBus.Mutex.Lock()
			for i, subscriber := range chatEventBus.Sockets {
				if subscriber == socket {
					chatEventBus.deleteSubscription(i)
					if len(chatEventBus.Sockets) == 0 {
						delete(eventBus.Chats, chatId)
					}
					break
				}
			}
			chatEventBus.Mutex.Unlock()
		}
		return nil
	})

	for {
		messageType, message, err := socket.ReadMessage()
		if err != nil {
			socket.CloseHandler()
			break
		}

		if messageType == ws.TextMessage {
			var parsedMessage struct {
				AccessKey string `json:"accessKey"`
				Event     string `json:"event"`
				EventData struct {
					Chats []int `json:"chats"`
				} `json:"eventData"`
			}
			json.Unmarshal(message, &parsedMessage)

			keyExists, _ := db.ValidateAccessKey(parsedMessage.AccessKey)
			if !keyExists {
				socket.WriteMessage(ws.TextMessage, []byte(`{"error":"Access denied"}`))
				socket.CloseHandler()
				break
			}

			if parsedMessage.Event == "subscribe" {
				for _, chatId := range parsedMessage.EventData.Chats {
					chatEventBus, exists := eventBus.Chats[chatId]
					if !exists {
						chatEventBus = new(subEventBus)
						eventBus.Chats[chatId] = chatEventBus
					}
					chatEventBus.Mutex.Lock()
					chatEventBus.Sockets = append(chatEventBus.Sockets, socket)
					chatEventBus.Mutex.Unlock()
				}
			}
		}
	}
}

func openSqlConnection() (db database.DB, err error) {
	sqlSourceString := fmt.Sprintf("%s:%s@tcp(%s)/%s",
		os.Getenv("dbUser"),
		os.Getenv("dbPassword"),
		os.Getenv("dbHost"),
		os.Getenv("dbName"))
	db.Conn, err = sql.Open("mysql", sqlSourceString)
	if err != nil {
		return
	}
	return
}

func logEventBus() {
	log.Println(eventBus)
	for key, value := range eventBus.Chats {
		log.Println(key, value)
	}
	time.Sleep(5 * time.Second)
	logEventBus()
}

func main() {
	eventBus.Chats = make(map[int]*subEventBus)

	// go logEventBus()

	db, err := openSqlConnection()
	if err != nil {
		log.Fatalln(err)
	}

	err = db.InitDatabase()
	if err != nil {
		log.Fatalln(err)
	}

	db.Close()

	/* Static */
	staticAssets := http.FileServer(http.Dir("content/assets"))
	staticJs := http.FileServer(http.Dir("content/js"))
	staticCss := http.FileServer(http.Dir("content/css"))
	http.Handle("/assets/", http.StripPrefix("/assets", staticAssets))
	http.Handle("/js/", http.StripPrefix("/js", staticJs))
	http.Handle("/css/", http.StripPrefix("/css", staticCss))

	/* Routing */
	http.HandleFunc("/", handleRequest)

	/* WebSocket */
	http.HandleFunc("/liveUpdates", handleLiveUpdates)

	/* Api */
	http.HandleFunc("/registerUser", handleRegisterUser)
	http.HandleFunc("/auth", handleAuth)
	http.HandleFunc("/getMe", handleGetMe)
	http.HandleFunc("/getChats", handleGetChats)
	http.HandleFunc("/getChat", handleGetChat)
	http.HandleFunc("/getUser", handleGetUser)
	http.HandleFunc("/sendMessage", handleSendMessage)
	http.HandleFunc("/getMessages", handleGetMessages)
	http.HandleFunc("/enterChat", handleEnterChat)
	http.HandleFunc("/createChat", handleCreateChat)
	http.HandleFunc("/deleteMessages", handleDeleteMessages)

	err = http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatalln(err.Error())
	}
}

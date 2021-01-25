package database

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"log"
	"strconv"
	"time"
)

type DB struct {
	Conn *sql.DB
}

func (db *DB) Close() {
	db.Conn.Close()
}

func (db *DB) InitDatabase() error {
	var (
		query string
		err   error
	)

	query = "CREATE TABLE IF NOT EXISTS users ( " +
		"id INT AUTO_INCREMENT PRIMARY KEY , " +
		"username VARCHAR(16) COLLATE utf8_bin UNIQUE, " +
		"register_ts INT, " +
		"hash VARCHAR(64), " +
		"auth_done BOOLEAN " +
		"); "
	_, err = db.Conn.Exec(query)
	if err != nil {
		return err
	}

	query = "SELECT COUNT(*) FROM users"
	queryResult := db.Conn.QueryRow(query)
	var usersCount int
	err = queryResult.Scan(&usersCount)
	if err != nil {
		return err
	}

	query = "CREATE TABLE IF NOT EXISTS chats ( " +
		"id INT AUTO_INCREMENT PRIMARY KEY, " +
		"owner_id INT, " +
		"name VARCHAR(64) COLLATE utf8_bin UNIQUE, " +
		"create_ts INT, " +
		"hash VARCHAR(64), " +
		"last_message_ts INT, " +
		"messages_count INT, " +
		"members_count INT, " +
		"FOREIGN KEY (owner_id) REFERENCES users (id) " +
		"); "
	_, err = db.Conn.Exec(query)
	if err != nil {
		return err
	}

	query = "CREATE TABLE IF NOT EXISTS chats_members ( " +
		"chat_id INT, " +
		"member_id INT, " +
		"is_owner BOOLEAN, " +
		"PRIMARY KEY (chat_id, member_id), " +
		"FOREIGN KEY (chat_id) REFERENCES chats (id), " +
		"FOREIGN KEY (member_id) REFERENCES users (id) " +
		");"
	_, err = db.Conn.Exec(query)
	if err != nil {
		return err
	}

	query = "CREATE TABLE IF NOT EXISTS access_keys ( " +
		"user_id INT, " +
		"death_ts INT, " +
		"hash VARCHAR(64), " +
		"PRIMARY KEY (user_id, death_ts), " +
		"FOREIGN KEY (user_id) REFERENCES users (id) " +
		"); "
	_, err = db.Conn.Exec(query)
	if err != nil {
		return err
	}

	query = "CREATE TABLE IF NOT EXISTS messages ( " +
		"chat_id INT, " +
		"message_id INT AUTO_INCREMENT, " +
		"sender_id INT, " +
		"ts INT, " +
		"text VARCHAR(2048), " +
		"PRIMARY KEY (chat_id, message_id), " +
		"FOREIGN KEY (chat_id) REFERENCES chats (id), " +
		"FOREIGN KEY (sender_id) REFERENCES users (id) " +
		") ENGINE=MyISAM; "
	_, err = db.Conn.Exec(query)
	if err != nil {
		return err
	}

	query = "CREATE TABLE IF NOT EXISTS messages_attachments ( " +
		"chat_id INT, " +
		"message_id INT, " +
		"type VARCHAR(64), " +
		"hash VARCHAR(64), " +
		"FOREIGN KEY (chat_id) REFERENCES chats (id), " +
		"FOREIGN KEY (message_id) REFERENCES messages (message_id) " +
		") ENGINE=MyISAM; "
	_, err = db.Conn.Exec(query)
	if err != nil {
		return err
	}

	/* If database just created */
	if usersCount == 0 {
		query = "INSERT INTO users VALUES " +
			"(0, 'starterBot', 0, 'my-hash-is-unhackable', 1)"
		result, err := db.Conn.Exec(query)
		if err != nil {
			return err
		}
		starterBotId, _ := result.LastInsertId()

		starterChatId, err := db.CreateChat(int(starterBotId), "starterChat", "starterChat")
		if err != nil {
			return err
		}

		starterChatMessage1 := "Hello! Cool that you registered!\n " +
			"I created this chat in case you are alone and there is no people you could talk to. " +
			"I will listen to you, but won’t answer."
		starterChatMessage2 := "If you not alone and have people to talk to, " +
			"you may be interested in how to create your own chat. " +
			"Here is the answer: on the left panel there is the button with «+» sign."

		db.AddMessage(starterChatId, int(starterBotId), starterChatMessage1)
		db.AddMessage(starterChatId, int(starterBotId), starterChatMessage2)
	}

	return nil
}

func (db *DB) RegisterUser(username, password string) (int, error) {
	query := "INSERT INTO users " +
		"(`username`, `register_ts`, `hash`, `auth_done`) " +
		"VALUES (?, ?, ?, FALSE)"

	registerTs := int(time.Now().Unix())
	hash := sha256.Sum256([]byte(username + strconv.Itoa(registerTs) + password))
	hashString := hex.EncodeToString(hash[:])

	result, err := db.Conn.Exec(query, username, registerTs, hashString)
	if err != nil {
		return 0, err
	}

	userId, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	return int(userId), nil
}

type User struct {
	Id         int    `json:"id"`
	Username   string `json:"username"`
	RegisterTs int    `json:"registerTs"`
}

func (db *DB) GetUser(userId int) (User, bool) {
	query := "SELECT username, register_ts " +
		"FROM users WHERE id = ?"
	row := db.Conn.QueryRow(query, userId)

	user := User{userId, "", 0}
	err := row.Scan(&user.Username, &user.RegisterTs)
	if err != nil {
		log.Println(err)
		return user, false
	}

	return user, true
}

func (db *DB) CreateAccessKey(username, password string) (string, int, error) {
	query := "SELECT id, register_ts, hash, auth_done " +
		"FROM users WHERE username = ?"
	queryResult := db.Conn.QueryRow(query, username)

	var (
		userId     int
		registerTs int
		hash       string
		authDone   bool
	)

	err := queryResult.Scan(&userId, &registerTs, &hash, &authDone)
	if err != nil {
		return "", 0, errors.New("User does not exist")
	}

	hashOfGivenPassword := sha256.Sum256([]byte(username + strconv.Itoa(registerTs) + password))
	hashOfGivenPasswordString := hex.EncodeToString(hashOfGivenPassword[:])

	if hashOfGivenPasswordString != hash {
		return "", 0, errors.New("Incorrect password")
	}

	query = "INSERT INTO access_keys VALUES (?, ?, ?)"

	deathTs := int(time.Now().Add(time.Hour * 24).Unix())
	key := sha256.Sum256([]byte(username + strconv.Itoa(deathTs) + password))
	keyString := hex.EncodeToString(key[:])

	_, err = db.Conn.Exec(query, userId, deathTs, keyString)
	if err != nil {
		return "", 0, err
	}

	if !authDone {
		db.addChatMember(1, userId, false)
		query = "UPDATE users SET auth_done = TRUE WHERE id = ?"
		db.Conn.Exec(query, userId)
	}

	return keyString, deathTs, nil
}

func (db *DB) ValidateAccessKey(key string) (keyExists bool, userId int) {
	query := "SELECT user_id, death_ts, hash " +
		"FROM access_keys WHERE hash = ?"
	queryResult := db.Conn.QueryRow(query, key)

	var keyData struct {
		UserId  int
		DeathTs int
		Hash    string
	}

	err := queryResult.Scan(&keyData.UserId, &keyData.DeathTs, &keyData.Hash)
	if err != nil {
		return false, 0
	}

	return true, keyData.UserId
}

func (db *DB) CreateChat(ownerId int, name string, password string) (int, error) {
	query := "INSERT INTO chats " +
		"(`owner_id`, `name`, `create_ts`, `hash`, `last_message_ts`, `messages_count`, `members_count`) " +
		"VALUES (?, ?, ?, ?, ?, 0, 0)"

	ts := int(time.Now().Unix())
	hash := sha256.Sum256([]byte(name + strconv.Itoa(ts) + password))
	hashString := hex.EncodeToString(hash[:])

	result, err := db.Conn.Exec(query, ownerId, name, ts, hashString, ts)
	if err != nil {
		return 0, err
	}

	chatId, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	err = db.addChatMember(int(chatId), ownerId, true)
	if err != nil {
		return 0, err
	}

	return int(chatId), nil
}

func (db *DB) EnterChat(userId int, chatName, ChatPassword string) (int, error) {
	query := "SELECT id, create_ts, hash FROM chats WHERE name = ?"
	chat := db.Conn.QueryRow(query, chatName)
	var (
		chatId       int
		chatCreateTs int
		chatHash     string
	)
	err := chat.Scan(&chatId, &chatCreateTs, &chatHash)
	if err != nil {
		log.Println(err)
		return 0, errors.New("Chat not found")
	}

	hashOfGivenPassword := sha256.Sum256([]byte(chatName + strconv.Itoa(chatCreateTs) + ChatPassword))
	hashOfGivenPasswordString := hex.EncodeToString(hashOfGivenPassword[:])

	if hashOfGivenPasswordString != chatHash {
		return 0, errors.New("Access denied")
	}

	userAlreadyInChat := db.IsUserInChat(userId, chatId)
	if err != nil {
		return 0, nil
	}
	if userAlreadyInChat {
		return 0, errors.New("User already in chat")
	}

	err = db.addChatMember(chatId, userId, false)
	if err != nil {
		return 0, err
	}

	return chatId, nil
}

func (db *DB) addChatMember(chatId, userId int, isOwner bool) error {
	query := "INSERT INTO chats_members VALUES " +
		"(?, ?, ?)"
	_, err := db.Conn.Exec(query, chatId, userId, isOwner)
	if err != nil {
		return err
	}

	query = "UPDATE chats " +
		"SET members_count = members_count + 1 " +
		"WHERE id = ?"
	_, err = db.Conn.Exec(query, chatId)
	if err != nil {
		return err
	}

	return nil
}

func (db *DB) RemoveChatMember(userId, chatId int) error {
	query := "DELETE FROM chats_members WHERE chat_id = ? AND member_id = ? LIMIT 1"
	_, err := db.Conn.Exec(query, chatId, userId)
	if err != nil {
		return err
	}

	query = "UPDATE chats SET members_count = members_count - 1 WHERE id = ?"
	_, err = db.Conn.Exec(query, chatId)

	return err
}

func (db *DB) AddMessage(chatId, senderId int, text string) (int, error) {
	userInChat := db.IsUserInChat(senderId, chatId)
	if !userInChat {
		return 0, errors.New("User not in chat")
	}

	if len(text) > 2048 {
		return 0, errors.New("Max message length is 2048")
	}

	query := "INSERT INTO messages " +
		"(`chat_id`, `sender_id`, `ts`, `text`) " +
		"VALUES (?, ?, ?, ?)"

	ts := time.Now().Unix()
	result, err := db.Conn.Exec(query, chatId, senderId, ts, text)
	if err != nil {
		return 0, err
	}

	messageId, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	query = "UPDATE chats " +
		"SET " +
		"messages_count = messages_count + 1, " +
		"last_message_ts = ? " +
		"WHERE id = ?"

	result, err = db.Conn.Exec(query, ts, chatId)
	if err != nil {
		return int(messageId), err
	}

	return int(messageId), err
}

func (db *DB) AddAttachment(chatId, messageId int, attachmentType, hash string) bool {
	query := "INSERT INTO messages_attachments " +
		"(chat_id, message_id, type, hash) " +
		"VALUES (?, ?, ?, ?)"
	_, err := db.Conn.Exec(query, chatId, messageId, attachmentType, hash)
	if err != nil {
		log.Println(err)
		return false
	}

	return true
}

func (db *DB) IsUserInChat(userId, chatId int) bool {
	query := "SELECT member_id FROM chats_members " +
		"WHERE chat_id = ? AND member_id = ? LIMIT 1"

	row := db.Conn.QueryRow(query, chatId, userId)
	var member_id int
	err := row.Scan(&member_id)
	if err != nil {
		return false
	}

	return true
}

type Chat struct {
	Id            int    `json:"id"`
	Name          string `json:"name"`
	LastMessageTs int    `json:"lastMessageTs"`
}

func (db *DB) GetUserChats(userId int) ([]Chat, error) {
	query := "SELECT chats.id, chats.name, chats.last_message_ts " +
		"FROM chats_members LEFT JOIN chats " +
		"ON chats_members.chat_id = chats.id " +
		"WHERE chats_members.member_id = ? " +
		"ORDER BY chats.last_message_ts DESC"
	rows, err := db.Conn.Query(query, userId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	chats := []Chat{}

	for rows.Next() {
		var chatData Chat
		rows.Scan(&chatData.Id, &chatData.Name, &chatData.LastMessageTs)
		chats = append(chats, chatData)
	}

	return chats, nil
}

type Attachment struct {
	ContentType string `json:"contentType"`
	Hash        string `json:"hash"`
}

type Message struct {
	ChatId         int           `json:"chatId"`
	Id             int           `json:"id"`
	Ts             int           `json:"ts"`
	Text           string        `json:"text"`
	SenderId       int           `json:"senderId"`
	SenderUsername string        `json:"senderUsername"`
	Attachments    *[]Attachment `json:"attachments,omitempty"`
}

type ChatMember struct {
	Id       int    `json:"id"`
	Username string `json:"username"`
}

type ChatInformation struct {
	Id            int    `json:"id"`
	OwnerId       int    `json:"ownerId"`
	Name          string `json:"name"`
	CreateTs      int    `json:"createTs"`
	LastMessageTs int    `json:"lastMessageTs"`
	MembersCount  int    `json:"membersCount"`
	MessagesCount int    `json:"messagesCount"`
	Messages      struct {
		Offset int       `json:"offset"`
		Count  int       `json:"count"`
		Items  []Message `json:"items"`
	} `json:"messages"`
	Members []ChatMember `json:"members"`
}

func (db *DB) GetChat(userId, chatId int, withLastMessages, withMembers bool) (*ChatInformation, error) {
	query := "SELECT chat_id " +
		"FROM chats_members " +
		"WHERE member_id = ? AND chat_id = ?"
	row := db.Conn.QueryRow(query, userId, chatId)

	var accessToChat int
	row.Scan(&accessToChat)

	if accessToChat == 0 {
		return nil, errors.New("Access denied")
	}

	query = "SELECT id, owner_id, name, create_ts, last_message_ts, messages_count, members_count " +
		"FROM chats WHERE id = ?"
	row = db.Conn.QueryRow(query, chatId)

	var chat ChatInformation
	err := row.Scan(&chat.Id, &chat.OwnerId, &chat.Name, &chat.CreateTs, &chat.LastMessageTs, &chat.MessagesCount, &chat.MembersCount)
	if err != nil {
		log.Println(err)
		return nil, err
	}

	if withLastMessages {
		messages, err := db.GetMessages(chatId, 0, 20, true)
		if err != nil {
			return nil, err
		}
		chat.Messages.Items = messages
		chat.Messages.Count = len(messages)
		chat.Messages.Offset = 0
	}

	if withMembers {
		members, err := db.GetChatMembers(chatId)
		if err != nil {
			return nil, err
		}
		chat.Members = members
	}

	return &chat, nil
}

func (db *DB) GetChatMembers(chatId int) ([]ChatMember, error) {
	query := "SELECT id, username FROM users " +
		"WHERE id IN (SELECT member_id FROM chats_members WHERE chat_id = ?)"
	rows, err := db.Conn.Query(query, chatId)
	if err != nil {
		return nil, err
	}

	var members []ChatMember
	for rows.Next() {
		var cm ChatMember
		rows.Scan(&cm.Id, &cm.Username)
		members = append(members, cm)
	}

	return members, nil
}

func (db *DB) GetMessages(chatId, offset, messagesCount int, withUsernames bool) ([]Message, error) {
	var query string
	if withUsernames {
		query = "SELECT messages.chat_id, messages.message_id, messages.sender_id, messages.ts, messages.text, users.username, " +
			"attachments.type, attachments.hash " +
			"FROM messages " +
			"LEFT JOIN messages_attachments AS attachments " +
			"ON messages.chat_id = attachments.chat_id AND messages.message_id = attachments.message_id " +
			"LEFT JOIN users " +
			"ON users.id = messages.sender_id " +
			"WHERE messages.chat_id = ? " +
			"ORDER BY messages.message_id DESC " +
			"LIMIT ? OFFSET ?"
	} else {
		query = "SELECT messages.chat_id, messages.message_id, messages.sender_id, messages.ts, messages.text, " +
			"attachments.type, attachments.hash " +
			"FROM messages " +
			"LEFT JOIN messages_attachments AS attachments " +
			"ON messages.chat_id = attachments.chat_id AND messages.message_id = attachments.message_id " +
			"WHERE messages.chat_id = ? " +
			"ORDER BY messages.message_id DESC " +
			"LIMIT ? OFFSET ?"
	}

	rows, err := db.Conn.Query(query, chatId, messagesCount, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := []Message{}
	if withUsernames {
		for rows.Next() {
			var m Message
			var a Attachment
			rows.Scan(&m.ChatId, &m.Id, &m.SenderId, &m.Ts, &m.Text, &m.SenderUsername, &a.ContentType, &a.Hash)
			found := false
			for i := range messages {
				if messages[i].Id == m.Id {
					found = true
					*messages[i].Attachments = append(*messages[i].Attachments, a)
				}
			}
			if !found {
				if a.Hash != "" {
					m.Attachments = &[]Attachment{Attachment{ContentType: a.ContentType, Hash: a.Hash}}
				}
				messages = append(messages, m)
			}
		}
	} else {
		for rows.Next() {
			var m Message
			var a Attachment
			rows.Scan(&m.ChatId, &m.Id, &m.SenderId, &m.Ts, &m.Text, &a.ContentType, &a.Hash)
			found := false
			for i := range messages {
				if messages[i].Id == m.Id {
					found = true
					*messages[i].Attachments = append(*messages[i].Attachments, a)
				}
			}
			if !found {
				if a.Hash != "" {
					m.Attachments = &[]Attachment{Attachment{ContentType: a.ContentType, Hash: a.Hash}}
				}
				messages = append(messages, m)
			}
		}
	}

	return messages, nil
}

func (db *DB) GetMessage(chatId, messageId int) (*Message, error) {
	query := "SELECT chat_id, message_id, sender_id, ts, text " +
		"FROM messages " +
		"WHERE chat_id = ? AND message_id = ?"
	messageRow := db.Conn.QueryRow(query, chatId, messageId)

	message := new(Message)
	err := messageRow.Scan(&message.ChatId, &message.Id, &message.SenderId, &message.Ts, &message.Text)
	if err != nil {
		return nil, err
	}

	return message, nil
}

func (db *DB) DeleteMessage(chatId, messageId int) error {
	query := "DELETE FROM messages_attachments " +
		"WHERE chat_id = ? AND message_id = ?"
	_, err := db.Conn.Exec(query, chatId, messageId)
	if err != nil {
		return nil
	}

	query = "DELETE FROM messages " +
		"WHERE chat_id = ? AND message_id = ? " +
		"LIMIT 1"
	_, err = db.Conn.Exec(query, chatId, messageId)
	if err != nil {
		return err
	}

	query = "UPDATE chats SET messages_count = messages_count - 1 WHERE id = ?"
	_, err = db.Conn.Exec(query, chatId)

	return err
}

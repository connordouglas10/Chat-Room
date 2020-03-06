// Require the packages we will use:
var http = require("http"),
socketio = require("socket.io"),
fs = require("fs");
// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
   // This callback runs when a new connection is made to our HTTP server.

   fs.readFile("client.html", function(err, data){
	   // This callback runs when the client.html file has been read from the filesystem.

	   if(err) return resp.writeHead(500);
	   resp.writeHead(200);
	   resp.end(data);
   });
});
app.listen(3456);


// Do the Socket.IO magic:
var io = socketio.listen(app);

// create global room object
var obj = {
   name: "global",
   creator: null,
   users: [],
   blacklist: [],
   pw: null
}

var myRooms = [];
myRooms.push(obj);

let users = [];
let userMap = {};
let usersId = {};

io.sockets.on("connection", function(socket){
   // This callback runs when a new Socket.IO connection is established.

   // function to add user to global room and to list of users
   socket.on('add_user',function(un){
	   if(users.includes(un)) {
		   socket.emit('duplicate_name', users);
	   }
	   else {
           console.log("add_user: ", un);
		   users.push(un);
		   socket.un = un;
		   socket.room = 'global';
		   usersId[socket.id] = un;
		   userMap[un]=socket.room;
		   socket.join('global');
		   socket.emit('render_chat', {message:'you have connected to ' + socket.room, room:socket.room});
		   // create list of names
		   names=[];
		   let creator = null;
		   for(let i=0; i<myRooms.length; i++) {
			   names.push(myRooms[i].name);
			   if(myRooms[i].name == socket.room){
				   creator = myRooms[i].creator;
			   }
		   }
		   socket.emit('render_rooms', names);
		   socket.emit('render_users',userMap, creator);
		   socket.broadcast.to(socket.room).emit('render_rooms', names);
		   socket.broadcast.to(socket.room).emit('render_users', userMap, creator);
		   socket.broadcast.to(socket.room).emit('send_message', {message:un + ' has connected to ' + socket.room, room:socket.room});
	   }
   });

   // function to create new room with correct creator
   socket.on('create_new_room', function(data){
	   roomName = data.rN;
	   roomPW = data.rPW;
	   roomCreator = data.creator;

	   let roomNameExists = false;
	   for(let i=0; i<myRooms.length; i++) {
		   if(roomName == myRooms[i].name){
			   roomNameExists = true;
		   }
	   }
	   if (roomNameExists){
		   //create general error message on client side to pass server-side error and return to global
           socket.emit('room_name_error', roomName);
	   }else{
		   var obj = {
			   users: [],
			   blacklist: []
		   };

		   obj.name= roomName;
		   obj.creator= roomCreator;

		   if(roomPW == null || roomPW == ""){
			   obj.pw = null;
		   }
		   else{
			   obj.pw = roomPW;
		   }

	   myRooms.push(obj);

	   let names=[];
	   for(let i=0; i<myRooms.length; i++) {
		   names.push(myRooms[i].name);
	   }
	   io.sockets.emit('render_rooms', names, userMap);
	   }
   });

   // function to join a room and change data in data structures accordingly to reflect the change
   socket.on('join_room', function(data, username, password){
	   let roomTo = data;
		let roomPassword = null;
		for(let i=0; i<myRooms.length; i++) {
			if(roomTo == myRooms[i].name){
				roomPassword = myRooms[i].pw;
				if(myRooms[i].blacklist.includes(username)){
					socket.emit("return_lobby", "Banned from this room");
				}
				if(roomPassword!=null && password==null){
					socket.emit('get_password', data, username);
				}
			}
		}
		
		if(roomPassword == password){
		    let oldRoom = socket.room;
	        socket.leave(socket.room);
	        socket.room = roomTo;
	        socket.join(roomTo);
	        userMap[username] = roomTo;
	        socket.emit('render_chat', {message:'you have connected to ' + socket.room, room:socket.room});
	        let names=[];
	        let creator = null;
	        for(let i=0; i<myRooms.length; i++) {
	     	   names.push(myRooms[i].name);
	     	   if(myRooms[i].name == socket.room){
	     			creator = myRooms[i].creator;
	     		}
	   }

	   let oldCreator = null;
	   for(let i=0; i<myRooms.length; i++) {
		if(myRooms[i].name == oldRoom){
			 oldCreator = myRooms[i].creator;
		 }
	}
	   socket.emit('render_rooms', names);
	   socket.emit('render_users',userMap, creator);
	   socket.broadcast.to(socket.room).emit('render_users', userMap, creator);
	   socket.broadcast.to(socket.room).emit('send_message', {message:socket.un + ' has connected to ' + socket.room, room:socket.room});
	   socket.broadcast.to(oldRoom).emit('render_users', userMap, oldCreator);
		}
   });

   // function to kick user and adjust data storage accordingly
   socket.on('kick_user', function(userName, roomName, creatorSent){
		//VERIFY CREATOR SENT MESSAGE
		let creator = null;
		for(let i=0; i<myRooms.length; i++) {
			if(myRooms[i].name == roomName){
				creator = myRooms[i].creator;
			}
		}
		if(creator = creatorSent){
			let kickSocketId = getKeyByValue(usersId, userName);
			io.to(kickSocketId).emit('return_lobby', "kicked from chat");
		}
   });

   // ban user
   socket.on('ban_user', function(userName, roomName, creatorSent){
		//VERIFY CREATOR SENT MESSAGE
		let creator = null;
		let room = null;
		for(let i=0; i<myRooms.length; i++) {
			if(myRooms[i].name == roomName){
					creator = myRooms[i].creator;
					room = myRooms[i];
			}
		}
		if(creator = creatorSent){
			let banSocketId = getKeyByValue(usersId, userName);
			room.blacklist.push(userName);
			io.to(banSocketId).emit('return_lobby', "banned from chat");
		}
   });

   socket.on('send_private', function(data){
		let recipientUn = data.recUn;
		let sendUn = data.un;
		let msg = data.message;
	
		let socketid = getKeyByValue(usersId, recipientUn);
		io.to(socketid).emit('send_message', {message: "(Private) " + sendUn + ": " + msg});
		socket.emit('send_message', {message: '(Private) You : ' + msg});
   });
   function getKeyByValue(object, value) {
	return Object.keys(object).find(key => object[key] === value);
  }
   socket.on('message_to_server', function(data) {
	   socket.broadcast.to(data['room']).emit('send_message', {message:data['un'] + ': ' + data['message']});
	   socket.emit('send_message', {message: 'You : ' + data['message']});
   });
});

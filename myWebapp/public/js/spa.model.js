/*
 * spa.model.js
 * Model module
*/

/*jslint         browser : true, continue : true,
  devel  : true, indent  : 2,    maxerr   : 50,
  newcap : true, nomen   : true, plusplus : true,
  regexp : true, sloppy  : true, vars     : false,
  white  : true
*/
/*global TAFFY, $, spa */

spa.model = (function(){
    'use strict';
    var
        configMap = {
            anon_id : 'a0'
        },
        stateMap = {
            anon_user : null,
            cid_serial : 0,
            is_connected : false,
            people_cid_map : {},
            people_db : TAFFY(),
            user : null
        },

        isFakeData = true,

        personProto, makeCid, clearPeopleDb, completeLogin,
        makePerson, removePerson, people, chat, initModule;

    // people API
    // ---------------------
    // 以 [spa.model.people.函数名]调用，提供了管理person对象的事件及方法
    //
    // public methods:
    //   * get_user() - 返回当前用户person对象，如果没有登录则
    //     返回anonymous person对象
    //
    //   * get_db() - 返回包含所有person的taffyDB数据集，已排序
    //
    //   * get_by_cid( <client_id> ) - 返回id对应person对象
    //
    //   * login( <user_name> ) - 对应用户登录，如果已登录，则切换到对应用户，
    //     如果成功登录，则发布一个'spa-login'全局事件
    //
    //   * logout()- 当前用户对象切换到匿名(anonymous person object)，
    //     成功登出则发布'spa-logout'事件
    //
    // jQuery global custom events:
    //   * spa-login - 成功登录时发布，更新后的用户对象以data提供.
    //
    //   * spa-logout - 成功登出时发布，更新后的用户对象以data提供.
    //
    // 每个用户以person对象表示
    // Person 对象方法:
    //   * get_is_user() - 如果对象是当前用户返回true
    //   * get_is_anon() - 如果对象是anonymous返回true
    //
    // Person 对象属性:
    //   * cid - 当前登录用户ID，除了当前后端未同步时,应与ID保持一致.
    //   * id - the unique id. This may be undefined if the
    //     object is not synced with the backend.
    //   * name - 用户名.
    //   * css_map - 用作avatar 展示的css属性集.
    //

    personProto = {
        get_is_user : function(){
            return this.cid   === stateMap.user.cid;
        },
        get_is_anon : function(){
            return this.cid === stateMap.anon_user.cid;
        }
    };

    makeCid = function () {
        return 'c' + String(stateMap.cid_serial++);
    };

    
    clearPeopleDb = function () {
      var user = stateMap.user;
      stateMap.people_db      = TAFFY();
      stateMap.people_cid_map = {};
      if(user){
          stateMap.people_db.insert(user);
          stateMap.people_cid_map [user.cid] = user;
      }
    };

    completeLogin = function (user_list) {
      var user_map = user_list[0];
      delete stateMap.people_cid_map[user_map.cid];
      stateMap.user.cid = user_map._id;
      stateMap.user.id = user_map._id;
      stateMap.user.css_map = user_map.css_map;
      stateMap.people_cid_map[user_map._id] = stateMap.user;
      chat.join();
      $.gevent.publish('spa-login',[stateMap.user]);
    };

    makePerson = function (person_map){
        var person,
            cid     = person_map.cid,
            css_map = person_map.css_map,
            id      = person_map.id,
            name    = person_map.name;

        if (cid === undefined || !name ){
            throw 'Client id and name required';
        }
        person          = Object.create(personProto);
        person.cid      = cid;
        person.name     = name;
        person.css_map  = css_map;

        if(id){
            person.id = id;
        }

        stateMap.people_cid_map[cid] = person;

        stateMap.people_db.insert(person);

        return person;
    };

    removePerson = function (person){
      if (!person){return false;}

      if(person.id === configMap.anon_id){
          return false;
      }

      stateMap.people_db({cid : person.cid}).remove();

      if(person.cid){
          delete stateMap.people_cid_map[person.cid];
      }
      return true;
    };

    people = (function(){
        var get_by_cid,get_db,get_user,
            login,logout;


        get_by_cid = function (cid){
          return stateMap.people_cid_map[cid];
        };
        get_db = function(){return stateMap.people_db;};
        get_user = function(){return stateMap.user;};


        login = function (name){
            var sio = isFakeData?
                spa.fake.mockSio : spa.data.getSio();

            stateMap.user = makePerson({
                cid : makeCid(),
                css_map : {top :25,left :25,'background-color':'#8f8'},
                name : name
            });

            sio.on('userupdate',completeLogin);

            sio.emit('adduser',{
                cid : stateMap.user.cid,
                css_map : stateMap.user.css_map,
                name : stateMap.user.name
            });
        };

        logout = function(){
            var user = stateMap.user;

            chat._leave();
            stateMap.user = stateMap.anon_user;
            clearPeopleDb();

            $.gevent.publish('spa-logout',[user]);
        };

        return{
            get_by_cid  : get_by_cid,
            get_db      : get_db,
            get_user    : get_user,
            login       : login,
            logout      : logout
        };
    }());

    // chat 对象 API
    // -------------------
    // 以 spa.model.chat.函数名 调用
    // chat对象提供了管理聊天的事件和方法。
    // public methods:
    //  * join() - 加入聊天房间 设置chat原型，发布
    //    'spa-listchange' 和 'spa-updatechat' global
    //    custom events. 如果当前用户未登录，return false
    //  * get_chatee() - 返回聊天对象的person对象，如果没有，返回null
    //  * set_chatee( <person_id> ) - 设置特定聊天对象.
    //    如果在person列表中不存在，设置为null.返回false 如果已经是当前聊天对象
    //    发布 'spa-setchatee' 全局事件
    //  * send_msg( <msg_text> ) - 给对象发信息.
    //    It publishes a 'spa-updatechat' global custom event.
    //    If the user is anonymous or the chatee is null, it
    //    aborts and returns false.
    //  * update_avatar( <update_avtr_map> ) - 发送
    //    update_avtr_map 到后端. 发布一个
    //    'spa-listchange' 事件 which publishes the updated
    //    people list and avatar information (the css_map in the
    //    person objects). The update_avtr_map must have the form
    //    { person_id : person_id, css_map : css_map }.形式规定
    //
    // jQuery global custom events:
    //  * spa-setchatee - 当新聊天对象设置时发布.
    //      A map of the form:形式
    //      { old_chatee : <old_chatee_person_object>,
    //        new_chatee : <new_chatee_person_object>
    //      }
    //    is provided as data.
    //  * spa-listchange - This is published when the list of
    //    online people changes in length (i.e. when a person
    //    joins or leaves a chat) or when their contents change
    //    (i.e. when a person's avatar details change).
    //    当person列表发生变化，avatar细节变化时发布.
    //    A subscriber to this event should get the people_db
    //    from the people model for the updated data.
    //    订阅者要能从中获得新的people_db
    //  * spa-updatechat - This is published when a new message
    //    is received or sent. A map of the form:
    //      { dest_id   : <chatee_id>,
    //        dest_name : <chatee_name>,
    //        sender_id : <sender_id>,
    //        msg_text  : <message_content>
    //      }
    //    is provided as data.
    //
    chat = (function () {
      var _publish_listchange, _publish_updatechat,
          _update_list, _leave_chat,

          get_chatee, join_chat, send_msg,
          set_chatee, update_avatar,

          chatee = null;

      _update_list = function ( arg_list ) {
        var i,person_map,make_person_map,person,
            people_list = arg_list[0],
            is_chatee_online = false;

        clearPeopleDb();

        PERSON:
        for (i=0;i<people_list.length;i++){
            person_map = people_list[i];

            if(!person_map.name){
                continue PERSON;
            }
            if(stateMap.user && stateMap.user.id === person_map._id){
                stateMap.user.css_map = person_map.css_map;
                continue PERSON;
            }
            make_person_map = {
                cid     : person_map._id,
                css_map : person_map.css_map,
                id      : person_map._id,
                name    : person_map.name
            };
            person = makePerson(make_person_map);

            if(chatee && chatee.id === make_person_map.id){
                is_chatee_online = true;
                chatee = person;
            }
        }

        stateMap.people_db.sort('name');
        if(chatee && !is_chatee_online){
            set_chatee('');
        }
      };

      _publish_listchange = function (arg_list) {
        _update_list(arg_list);
        $.gevent.publish('spa-listchange' , [arg_list]);
      };

      _publish_updatechat = function (arg_list) {
        var msg_map = arg_list[0];

        if(!chatee){
            set_chatee(msg_map.sender_id);
        }
        else if(msg_map.sender_id !== stateMap.user.id
                && msg_map.sender_id !== chatee.id
        ) {set_chatee(msg_map.sender_id);}

        $.gevent.publish('spa-updatechat',[msg_map]);
      };

      _leave_chat = function () {
          var sio = isFakeData
              ?spa.fake.mockSio : spa.data.getSio();
          chatee = null;
          stateMap.is_connected = false;
          if (sio){
              sio.emit('leavechat');
          }
      };

      get_chatee = function () {
        return chatee;
      };

      join_chat = function () {
          var sio;
          if(stateMap.is_connected){
              return false;
          }
          if(stateMap.user.get_is_anon()){
              console.warn('User must be defined before joining chat');
              return false;
          }

          sio = isFakeData
              ?spa.fake.mockSio:spa.data.getSio();

          sio.on('listchange',_publish_listchange);

          sio.on('updatechat',_publish_updatechat);

          stateMap.is_connected = true;
          return true;
      };

      send_msg = function (msg_text) {
        var msg_map,
            sio = isFakeData?spa.fake.mockSio:spa.data.getSio();

        if(!sio){
            return false;
        }
        if(!(stateMap.user&&chatee)){
            return false;
        }

        msg_map = {
            dest_id     : chatee.id,
            dest_name   : chatee.name,
            sender_id   : stateMap.user.id,
            msg_text    : msg_text
        };

        _publish_updatechat([msg_map]);

        sio.emit('updatechat',msg_map);

        return true;
      };

      set_chatee = function(person_id){
          var new_chatee;
          new_chatee  =stateMap.people_cid_map[person_id];

          if(new_chatee){
              if(chatee && chatee.id === new_chatee.id){
                  return false;
              }
          }
          else{
              new_chatee = null;
          }

          $.gevent.publish('spa-setchatee',
              {old_chatee : chatee,
              new_chatee : new_chatee
          });
          chatee = new_chatee;
          return true;
      };

      update_avatar = function ( avatar_update_map ){
          var sio = isFakeData
              ? spa.fake.mockSio : spa.data.getSio();
          if (sio){
              sio.emit('updateavatar' , avatar_update_map);
          }
      };
      return{
          _leave : _leave_chat,
          get_chatee : get_chatee,
          join : join_chat,
          send_msg : send_msg,
          set_chatee : set_chatee,
          update_avatar : update_avatar
      };
    }());

    initModule = function(){
        //初始化 anonymous person 对象
        stateMap.anon_user = makePerson({
            cid     : configMap.anon_id,
            id      : configMap.anon_id,
            name    : 'anonymous'
        });
        stateMap.user = stateMap.anon_user;
    };

    return{
        initModule  : initModule,
        chat        : chat,
        people      : people
    };
}());














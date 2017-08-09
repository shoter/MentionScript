// ==UserScript==
// @name         MentionScript
// @namespace    http://tampermonkey.net/
// @version      0.9.1
// @description  Mentions all user in group
// @author       Shoter
// @require      http://code.jquery.com/jquery-latest.js
// @match        https://www.facebook.com/groups*
// @grant        none
// ==/UserScript==

(function () {
	'use strict';

	function log(msg) {
		//console.log(msg);
	}

	function getQueryStringFromDictionary(dictionary) {
		var query = "";
		var first = true;
		for (var key in dictionary) {
			if (!first) {
				query += "&";
			}
			query += key;
			if (dictionary[key] != "") {
				query += "=" + dictionary[key];
			}
			first = false;
		}
		return query;
	}

	function transformQueryStringIntoDictionary(/*string*/ queryString) {
		var args = queryString.split("&");
		var dict = {};

		args.forEach(function (element) {
			var keyval = element.split("=");
			if (keyval.length == 2)
				dict[keyval[0]] = keyval[1];
			else
				dict[keyval[0]] = "";
		}, this);

		return dict;
	}

	function myDecodeURI(string) {
		var coding = { '@': '%40', ':': '%3A' };
		var ret = decodeURI(string);
		for (var key in coding) {
			ret = ret.replace(coding[key], key);
		}
		return ret;
	}


	function myEncodeURI(string) {
		var coding = { '@': '%40', ':': '%3A' };
		var ret = decodeURI(string);
		for (var key in coding) {
			ret = ret.replace(key, coding[key]);
		}
		return ret;
	}


	var handler = {
		apply: (target, self, argList) => {
			if (argList.length == 1) {
				if (typeof argList[0] === 'string') {
					var arg = myDecodeURI(argList[0]);
					if (typeof self._url === "string" && self._url.contains("add/comment")) {
						var params = (transformQueryStringIntoDictionary(arg));
						log("Add comment " + params["comment_text"]);
						if (getCommand(params["comment_text"]) !== null) {
							parseComment(target, self, params);
							return;
						}
					}
					else if (typeof self._url === "string" && self._url.contains("updatestatus.php")) {
						var params = (transformQueryStringIntoDictionary(arg));
						log("Add status " + params["xhpc_message_text"]);
						if (getCommand(params["xhpc_message_text"]) !== null) {
							parseStatus(target, self, params);
							return;
						}
					}
				}
			}
			return target.apply(self, argList);
		}
	};

	function parseComment(target, xhr, params) {
		var command = getCommand(params["comment_text"]);
		if (command !== null) {
			commands[command].commentTransform(command, target, xhr, params, parseComment);
		}
		else {
			return target.apply(xhr, [myEncodeURI(getQueryStringFromDictionary(params))]);
		}
	}

	function parseStatus(target, xhr, params) {
		var command = getCommand(params["xhpc_message"]);
		if (command !== null) {
			commands[command].statusTransform(command, target, xhr, params, parseStatus);
		}
		else {
			return target.apply(xhr, [myEncodeURI(getQueryStringFromDictionary(params))]);
		}
	}

	var commands =
		{
			"!mention_all!":
			{
				commentTransform: (command, target, xhr, queryDictionary, retFunc) => {
					log(command + " - commentTransform");
					getMembers(getGroupID(), (members) => {
						var txt = createUrlMentions(members);
						queryDictionary = modifyComment(command, queryDictionary, txt);
						retFunc(target, xhr, queryDictionary);
					});

				},
				statusTransform: (command, target, xhr, queryDictionary, retFunc) => {
					getMembers(getGroupID(), (members) => {
						log(command + " - statusTransform");
						var urlText = createUrlMentions(members);
						var text = createTextMentions(members);
						queryDictionary = modifyStatus(command, queryDictionary, urlText, text);
						retFunc(target, xhr, queryDictionary);
					});
				}
			},

			"!date!":
			{
				commentTransform: (command, target, xhr, queryDictionary, retFunc) => {
					log(command + " - commentTransform");
					queryDictionary = modifyComment(command, queryDictionary, new Date().toJSON().slice(0, 10).replace(/-/g, '/'));
					retFunc(target, xhr, queryDictionary);

				},
				statusTransform: (command, target, xhr, queryDictionary, retFunc) => {
					log(command + " - statusTransform");
					var date = new Date().toJSON().slice(0, 10).replace(/-/g, '/');
					queryDictionary = modifyStatus(command, queryDictionary, date, date);
					retFunc(target, xhr, queryDictionary);
				}
			}
		};


	function modifyComment(keyword, queryDictionary, text) {
		queryDictionary["comment_text"] = queryDictionary["comment_text"].replace(keyword, text);
		return queryDictionary;
	}

	function modifyStatus(keyword, queryDictionary, urlText, text) {
		queryDictionary["xhpc_message"] = queryDictionary["xhpc_message"].replace(keyword, urlText);
		queryDictionary["xhpc_message_text"] = queryDictionary["xhpc_message_text"].replace(keyword, text);
		return queryDictionary;
	}

	function createMention(uid, username) {
		return "@[" + uid + ":" + username + "]";
	}

	function createTextMentions(users) {
		var ret = "";
		var first = true;
		users.forEach(function (user) {
			if (first == false) ret += " ";
			ret += user.username;
			first = false;
		}, this);
		return ret;
	}

	function createUrlMentions(users) {
		var ret = "";
		var first = true;
		users.forEach(function (user) {
			if (first == false) ret += " ";
			ret += createMention(user.userID, user.username);
			first = false;
		}, this);
		return ret;
	}


	function getMembers(/*groupID*/ groupID, /*(array memberIDs)*/ func) {
		var xhr = new XMLHttpRequest();

		xhr.onreadystatechange = function () {
			if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {

				var resp = xhr.response.replace(/<!--/g, "");
				resp = resp.replace(/-->/g, "");
				var $a = $(resp).find("a[data-hovercard]:not([class])");

				var members = [];

				$a.each((i, elem) => {
					members.push(
						{
							userID: extractUserID($(elem).data("hovercard")),
							username: $(elem).text()

						});

				});

				func(members);
			}

		};

		xhr.open('GET', 'https://www.facebook.com/groups/' + groupID + '/members/', true);
		xhr.setRequestHeader('cache-control', 'max-age=0');
		xhr.setRequestHeader('accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8');
		xhr.send();
	}

	function extractUserID(/*string*/ hovercardData) {
		var data = hovercardData.split("?")[1]
			.split("&");

		for (var val in data) {
			var param = data[val];
			var keyval = param.split("=");

			if (keyval[0] == "id") {
				return keyval[1];
			}
		}
	}

	function getGroupID() {
		var re = /facebook.com\/groups\/([0-9]+)/;
		var found = window.location.href.match(re);
		return found[1];
	}





	function getCommand(text) {
		for (var command in commands) {
			if (text.contains(command))
				return command;
		}
		return null;
	}

	var saveUrl =
		{
			apply: (target, self, argList) => {
				if (typeof argList[1] === "string")
					self._url = argList[1];
				return target.apply(self, argList);
			}
		};

	function print_call_stack() {
		var stack = new Error().stack;
		console.log("PRINTING CALL STACK");
		console.log(stack);
	}

	XMLHttpRequest.prototype.send = new Proxy(XMLHttpRequest.prototype.send, handler);
	XMLHttpRequest.prototype.open = new Proxy(XMLHttpRequest.prototype.open, saveUrl);

	console.log("MentionScript loaded");


})();
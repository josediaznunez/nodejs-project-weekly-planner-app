const path = require('path');
const PORT = process.env.PORT || 5000;
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const pg = require("pg");
const connectionString = process.env.DATABASE_URL || "postgres://test_user:password@localhost:5432/weekly_planner";

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(express.static(path.join(__dirname, '/public')));
app.use("/public/stylesheets", express.static(__dirname + "/public/stylesheets"));
app.use("/public/scripts", express.static(__dirname + "/public/scripts"));

app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'ejs');

app.get('/', function(req, res) {
	getDaysAndTasks(req, res);
});

app.get('/weeklyUpdate', function (req, res) {
	console.log('Got a request for an update...');
	getWeeklyUpdate(req, res);
});

app.post('/', function(req, res) {
	if (req.body.available_time != null) {
		updateAvailableTime(req, res);
	} else if (req.body.task_id != null) {
		deleteTask(req, res);
	} else {
		createNewTask(req, res);
	}
});

app.listen(PORT, function() { 
	console.log(`Listening on port ${ PORT }`);
});

function getWeeklyUpdate(request, response) {
	// Using a helper function to query DB and provide callback after processing
	getWeeklyUpdateFromDb(function(error, result) {
		// Callback function that will be called when the DB done
		if (error || result == null) {
			response.status(500).json({success: false, data: error});
		} else {
			console.log("Received results from database: " + result);
			response.json(result);
		}
	});
}

function getWeeklyUpdateFromDb(callback) {
	console.log("Getting weekly update from DB...");

	var client = new pg.Client(connectionString);

	client.connect(function(err) {
		if (err) {
			console.log("Error connecting to DB: ")
			console.log(err);
			callback(err, null);
		}

		var sql =  "SELECT total_work_time_day, total_available_time_day " +
                   "FROM day";

		var query = client.query(sql, function(err, result) {
			// Done getting data from DB; disconnect the client
			client.end(function(err) {
				if (err) throw err;
			});

			if (err) {
				console.log("Error in query: ")
				console.log(err);
				callback(err, null);
			}

			// Giving results to callback
			callback(null, result.rows);
		});
	});
}

function getDaysAndTasks(request, response) {
	// Use a helper function to query DB and provide callback after processing
	getDaysAndTasksFromDb(function(error, result) {
		// Callback function that will be called when the DB done
		if (error || result == null) {
			response.status(500).json({success: false, data: error});
		} else {
			var days = {};
			days[1]  = {};
			days[2]  = {};
			days[3]  = {};
			days[4]  = {};
			days[5]  = {};
			days[6]  = {};
			days[7]  = {};

			for (const index in result) {
				var dayId = result[index].day_id;
				days[dayId]["name"]                     = result[index].name;
				days[dayId]["total_available_time_day"] = result[index].total_available_time_day;
				days[dayId]["total_work_time_day"]      = result[index].total_work_time_day;
			}

			response.render('pages/planner', {
				daysAndTasks: result,
				days: days
			});	
		}
	});
}

function getDaysAndTasksFromDb(callback) {
	console.log("Getting days from DB");

	var client = new pg.Client(connectionString);

	client.connect(function(err) {
		if (err) {
			console.log("Error connecting to DB: ")
			console.log(err);
			callback(err, null);
		}

		var sql =  "SELECT "                                                                        +
		                "td.task_day_id, td.task_id, td.day_id, t.task_id, t.class, t.description," +
		                "t.due_time, t.total_work_time, d.day_id, d.name, d.total_work_time_day,"   +
		                "d.total_available_time_day "                                               +
		           	"FROM task_day as td "                                                          +
					"INNER JOIN task as t "                                                         +
						"ON td.task_id = t.task_id "                                                +
					"RIGHT JOIN day as d "                                                          +
						"ON td.day_id = d.day_id;";

		var query = client.query(sql, function(err, result) {
			// Done getting data from DB; disconnect the client
			client.end(function(err) {
				if (err) throw err;
			});

			if (err) {
				console.log("Error in query: ")
				console.log(err);
				callback(err, null);
			}

			// Giving results to callback
			callback(null, result.rows);
		});
	});
}

function createNewTask(req, res) {
	insertNewTaskIntoDb(function (error, result) {
		console.log("Inserting new task_day value into DB...");

		var client = new pg.Client(connectionString);

		client.connect(function(err) {
			if (err) {
				console.log("Error connecting to DB: ")
				console.log(err);
			}

			var sql = "INSERT INTO task_day" 		+
						"("							+
						  "task_id"					+
						", day_id"					+
						") "						+
						"VALUES"					+
						"("							+ 
						      result.last_task_id 	+ 
						"," + result.last_day_id	+ 
						")";
			
			var sqlUpdate = "UPDATE day "                                      +
			                "SET total_work_time_day = total_work_time_day + " + 
							result.work_time                                   + 
							" WHERE day_id = "                                 + 
							result.last_day_id;
					
			sql += ";" + sqlUpdate;

			var query = client.query(sql, function(err, result) {
				// Done getting data from DB; disconnect the client
				client.end(function(err) {
					if (err) throw err;
					getDaysAndTasks(req, res);
				});
			});
		});

		console.log("Inserted new task_day value...");		
	}, req, res);
}

function insertNewTaskIntoDb(callback, req, res) {
	var course = req.body.course;
	var description = req.body.description;
	var due = req.body.due + ":00";
	var work_time = req.body.work_time;
	var dayId = req.body.day_id;

	console.log("Inserting new task into DB...");

	var client = new pg.Client(connectionString);

	client.connect(function(err) {
		if (err) {
			console.log("Error connecting to DB: ")
			console.log(err);
			callback(err, null);
		}

		var sql = "INSERT INTO task"           +
                  "("                          +
                      "class"                  +
				   ", description"             +
				   ", due_time"                +
				   ", total_work_time"         +
				   ") "                        +
				   "VALUES"                    +
				   "("                         + 
				   "'" + course      + "'"     + 
				   ", '" + description + "'"   + 
				   ", '" + due         + "'"   + 
				   ", "  + work_time           + 
				   ") "                        +
				   "RETURNING task_id";

		var query = client.query(sql, function(err, result) {
			// Done getting data from DB; disconnect the client
			
			client.end(function(err) {
				if (err) throw err;
			});

			callback(null, {
				last_task_id: result.rows[0].task_id,
				last_day_id: dayId,
				work_time: work_time
			});
		});
	});

	console.log("Inserted new task...");
}

function updateAvailableTime(request, response) {
	console.log("Updating day table...");

	var client = new pg.Client(connectionString);

	client.connect(function(err) {
		if (err) {
			console.log("Error connecting to DB: ")
			console.log(err);
		}

		var sql = "UPDATE day SET total_available_time_day = " + 
                   request.body.available_time                 + 
                   " WHERE day_id = "                          + 
                   request.body.day_id;

		var query = client.query(sql, function(err, result) {
			// Done getting data from DB; disconnect the client
			client.end(function(err) {
				if (err) throw err;
				getDaysAndTasks(request, response);
			});
		});
	});

	console.log("Updated available time in day table...");			
}

function deleteTask(request, response) {	
	console.log("Deleting task #" + request.body.task_id);

	var client = new pg.Client(connectionString);

	client.connect(function(err) {
		if (err) {
			console.log("Error connecting to DB: ")
			console.log(err);
		}

		var sqlUpdate = "UPDATE day SET total_work_time_day = total_work_time_day - " + 
                        "(SELECT total_work_time FROM task WHERE task_id = "          +
                             request.body.task_id + ") "                              +
						" WHERE day_id = "                                            + 
                        "(SELECT day_id FROM task_day WHERE task_id = "               + 
                             request.body.task_id + ")";

		var sql = "DELETE FROM task_day WHERE task_id = " + request.body.task_id + ";" +
				  "DELETE FROM task     WHERE task_id = " + request.body.task_id;

		sqlUpdate += ";" + sql;

		var query = client.query(sqlUpdate, function(err, result) {
			// Done getting data from DB; disconnect the client
			client.end(function(err) {
				if (err) throw err;
				getDaysAndTasks(request, response);
			});
		});
	});

	console.log("Deleted task...");			
}
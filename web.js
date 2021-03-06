var express = require('express'),
    cors = require('cors'),
    mongo = require('mongodb'),
    check = require('validator').check,
    sanitize = require('validator').sanitize,
    validate = require('jsonschema').validate;
var app = express();
app.use(express.logger());
app.use(express.bodyParser());

var db = null;
mongo.MongoClient.connect(process.env.MONGOHQ_URL, function(err, theDb) {
    if (err) {
        return console.dir(err);
    } else {
        db = theDb;
        return console.log("Connected to mongo at " + process.env.MONGOHQ_URL);
    }
});

var event_schema = {
    "type": "object",
    "additionalProperties": false,
    "properties": {
        "start_date": {
            "type": "string",
            "format": "date-time",
            "required": true
        },
        "end_date": {
            "type": "string",
            "format": "date-time"
        },
        "type": {
            "type": "string",
            "required": true
        },
        "details": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "name": {
                    "type": "string",
                    "required": true
                },
                "description": {
                    "type": "string"
                }
            }
        },
        "creator": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "email": {
                    "type": "string"
                },
                "name": {
                    "type": "string",
                    "required": true
                }
            }
        }
    }
};

app.get('/', function(req, res) {
    return res.sendfile('index.html');
});
app.get('/1.0/events', cors(), function(req, res) {
    if (!db) {
        return res.status(500).send({error: 'No db available.'});
    }

    var query = {};
    var limit = Math.floor(req.query.limit) || 5;

    if (req.query.lat && req.query.lon) {
        check(req.query.lat).max(90).min(-90).isDecimal();
        check(req.query.lon).max(180).min(-180).isDecimal();
        var lat = sanitize(req.query.lat).toFloat(),
            lon = sanitize(req.query.lon).toFloat();

        query['address.loc'] = {
            $nearSphere: {
                $geometry: {
                    type: "Point",
                    coordinates: [ lon, lat ]
                }
            }
        };

        if (req.query.distance) {
            check(req.query.distance).min(0).isDecimal();
            var distance = sanitize(req.query.distance).toFloat();

            query['address.loc']['$nearSphere']['$maxDistance'] = distance;
        }
    }

    if (req.query.from_date && req.query.to_date) {
        check(req.query.from_date).isDate();
        check(req.query.to_date).isDate().isAfter(req.query.from_date);
        var from = new Date(req.query.from_date),
            to = new Date(req.query.to_date);

        query['$or'] = [
            {'start_date': {'$gte': from, '$lte': to}},
            {'end_date': {'$gte': from, '$lte': to}}
        ];
    } else if (req.query.from_date) {
        check(req.query.from_date).isDate();

        var from = new Date(req.query.from_date);

        query['start_date'] = {
            $gte: from
        };
    } else if (req.query.to_date) {
        check(req.query.to_date).isDate();

        var to = new Date(req.query.to_date);

        query['end_date'] = {
            $lte: to
        };
    }

    console.log("Query (limit %s): %j", limit, query);

    db.collection('events').find(query).limit(limit).toArray(function(err, items) {
        if (err) {
            console.dir(err);
        }

        console.log("Results: %j", items);
        return res.send(items);
    });

});
app.get('/1.0/events/:event_id', cors(), function(req, res) {
    if (!db) {
        return res.status(500).send({error: 'No db available.'});
    }

    var query = {'_id': new mongo.ObjectID(req.params.event_id)};

    db.collection('events').findOne(query, function(err, item) {
        if (err) {
            console.dir(err);
        }

        if (item) {
            return res.send(item);
        } else {
            return res.status(404).send({error: 'That event doesn\'t exist.'});
        }
    });
});
app.post('/1.0/events', cors(), function(req, res) {
    if (!db) {
        return res.status(500).send({error: 'No db available.'});
    }

    var validation = validate(req.body, event_schema);
    console.dir(validation);

    if (validation.errors.length > 0) {
        var errors = [];
        for (var i = 0; i < validation.errors.length; i++) {
            errors.push(validation.errors[i].stack);
        }
        return res.status(400).send(errors);
    }

    db.collection('events').insert(req.body, function(err, item) {
        return res.send(item);
    });
});

var port = process.env.PORT || 5000;
app.listen(port, function() {
    console.log("Listening on " + port);
});
const express = require('express');
const unirest = require('unirest');
const app = express();
var bodyParser = require('body-parser');
const mongoose = require('mongoose');
require('dotenv').config();
var AWS = require('aws-sdk');

app.set('views', './views');
app.set('view engine', 'pug');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

mongoose.connect('mongodb://localhost:27017/IDT', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
var db = mongoose.connection;
db.on('error', console.log.bind(console, 'connection error'));
db.once('open', function(callback) {
  console.log('connection succeeded');
});

const LoggerMiddleware = (req, res, next) => {
  console.log(
    `✅  Logged  http://localhost:8080/${req.originalUrl} 👉  ${req.method}  `
  );
  next();
};
app.use(LoggerMiddleware);

app.post('/', async (req, res) => {
  try {
    var apiCall = unirest(
      'GET',
      'https://ip-geolocation-ipwhois-io.p.rapidapi.com/json/'
    );
    apiCall.query({
      ip: req.body.ip
    });
    apiCall.headers({
      'x-rapidapi-host': 'ip-geolocation-ipwhois-io.p.rapidapi.com',
      'x-rapidapi-key': 'a9d73a4318mshf01cbdf431df4bap1168d0jsnb52ec1fbb75b'
    });
    apiCall.end(function(result) {
      if (res.error) throw new Error(result.error);
      if (!result.body.success) {
        res.status(400).json({
          status: 'fail',
          error: 'invalid IP address'
        });
        return;
      }

      result.body.timestamp = Math.floor(Date.now() / 1000);

      db.collection('Locations').insertOne(result.body, function(err) {
        if (err) throw err;
        console.log('Record inserted Successfully');
      });

      res.render('detail', {
        lng: result.body.longitude,
        lat: result.body.latitude
      });
    });
  } catch (e) {
    res.status(500).json({
      status: 'fail',
      error: e.message
    });
  }
});

app.get('/', async (req, res) => {
  res.render('index');
});

app.get('/histories', async (req, res) => {
  var last = req.query.takeLast;
  var startDate = new Date(req.query.start) / 1000,
    endDate = new Date(req.query.end) / 1000;
  if (startDate > endDate) {
    res.status(500).json({
      status: 'fail',
      message: 'invalid Date Ranged'
    });
    return;
  }
  var result = '';
  if (req.query.start.length === 0 && req.query.end.length === 0) {
    result = await db
      .collection('Locations')
      .find({})
      .limit(parseInt(last))
      .toArray();
  } else {
    result = await db
      .collection('Locations')
      .find({ timestamp: { $gte: startDate, $lte: endDate } })
      .limit(parseInt(last))
      .toArray();
  }

  res.render('histories', { result: result });
});

app.get('/send', async (req, res) => {
  try {
    var apiCall = unirest(
      'GET',
      'https://ip-geolocation-ipwhois-io.p.rapidapi.com/json/'
    );
    apiCall.query({
      ip: req.query.ip
    });
    apiCall.headers({
      'x-rapidapi-host': 'ip-geolocation-ipwhois-io.p.rapidapi.com',
      'x-rapidapi-key': 'a9d73a4318mshf01cbdf431df4bap1168d0jsnb52ec1fbb75b'
    });
    apiCall.end(function(result) {
      if (res.error) throw new Error(result.error);
      if (!result.body.success) {
        res.status(400).json({
          status: 'fail',
          error: 'invalid IP address'
        });
        return;
      }
      const mess =
        result.body.city +
        ' , ' +
        result.body.region +
        ' , ' +
        result.body.country;
      const phoneNum = req.query.phone;
      const subject = 'Location';
      var params = {
        Message: mess,
        PhoneNumber: phoneNum,
        MessageAttributes: {
          'AWS.SNS.SMS.SenderID': {
            DataType: 'String',
            StringValue: subject
          }
        }
      };
      var publishTextPromise = new AWS.SNS({ apiVersion: '2010-03-31' })
        .publish(params)
        .promise();
      publishTextPromise
        .then(function(data) {
          res.end(JSON.stringify({ MessageID: data.MessageId }));
        })
        .catch(function(err) {
          res.end(JSON.stringify({ Error: err }));
        });
    });
  } catch (e) {
    res.status(500).json({
      status: 'fail',
      error: e.message
    });
  }
});

app.listen(8080, () => {
  console.log("We've now got a server!");
  console.log('Your routes will be running on http://localhost:8080');
});

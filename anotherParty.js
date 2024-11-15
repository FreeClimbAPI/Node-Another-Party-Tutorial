require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const freeclimbSDK = require("@freeclimb/sdk");
const {
  AddToConference,
  CreateConference,
  PerclScript,
  Say,
  OutDial,
  IfMachine,
  CallStatus,
  ConferenceStatus,
  UpdateConferenceRequest,
} = freeclimbSDK;

const app = express();
app.use(bodyParser.json());
// NGROK Url
const host = process.env.HOST_URL;

// Localhost port
const port = process.env.PORT || 3000;

// your freeclimb API key (available in the Dashboard) - be sure to set up environment variables to store these values
const accountId = process.env.ACCOUNT_ID;
const apiKey = process.env.API_KEY;

const configuration = freeclimbSDK.createConfiguration({ accountId, apiKey });
const freeclimb = new freeclimbSDK.DefaultApi(configuration);

//e.164 phone number to call
const phonenumberToCall = process.env.DESTINATION_NUMBER;

app.post("/incomingCall", (req, res) => {
  console.log("incomingCall");

  const conference = new CreateConference({
    actionUrl: `${host}/conferenceCreated`,
  });
  const percl = new PerclScript({ commands: [conference] }).build();
  res.status(200).json(percl);
});

app.post("/conferenceCreated", (req, res) => {
  console.log("conferenceCreated");

  const createConferenceResponse = req.body;
  const conferenceId = createConferenceResponse.conferenceId;
  const say = new Say({ text: "Please wait while we attempt to connect you." });
  // implementation of lookupAgentPhoneNumber() is left up to the developer
  const agentPhoneNumber = lookupAgentPhoneNumber();

  // Make OutDial request once conference has been created
  const outDial = new OutDial({
    destination: agentPhoneNumber,
    callingNumber: createConferenceResponse.from,
    actionUrl: `${host}/outboundCallMade/${conferenceId}`,
    callConnectUrl: `${host}/callConnected/${conferenceId}`,
    // Hangup if we get a voicemail machine
    ifMachine: IfMachine.HANGUP,
  });
  const percl = new PerclScript({ commands: [say, outDial] }).build();
  res.status(200).json(percl);
});

app.post("/outboundCallMade/:conferenceId", (req, res) => {
  console.log("outboundCallMade");

  const outboundCallResponse = req.body;
  const conferenceId = req.params.conferenceId;
  // Add initial caller to conference
  const addToConference = new AddToConference({
    conferenceId,
    callId: outboundCallResponse.callId,
    // set the leaveConferenceUrl for the inbound caller, so that we can terminate the conference when they hang up
    leaveConferenceUrl: `${host}/leftConference`,
  });
  const percl = new PerclScript({ commands: [addToConference] }).build();
  res.status(200).json(percl);
});

app.post("/callConnected/:conferenceId", (req, res) => {
  console.log("callConnected");

  const callConnectedResponse = req.body;
  const conferenceId = req.params.conferenceId;
  console.log(`dialCallStatus is: ${callConnectedResponse.callStatus}`);
  console.log(`body: ${JSON.stringify(callConnectedResponse)}`);
  if (callConnectedResponse.callStatus != CallStatus.IN_PROGRESS) {
    console.log(CallStatus.IN_PROGRESS);
    console.log("in the terminate part");
    // Terminate conference if agent does not answer the call. Can't use PerCL command since PerCL is ignored if the call was not answered.
    terminateConference(conferenceId);
    return res.status(200).json([]);
  }
  const addToConference = new AddToConference({
    conferenceId,
    callId: callConnectedResponse.callId,
  });
  const percl = new PerclScript({ commands: [addToConference] }).build();
  res.status(200).json(percl);
});

app.post("/leftConference", (req, res) => {
  console.log("leftConference");

  // Call terminateConference when the initial caller hangsups
  const leftConferenceResponse = req.body;
  const conferenceId = leftConferenceResponse.conferenceId;
  terminateConference(conferenceId);
  res.status(200).json([]);
});

function terminateConference(conferenceId) {
  console.log("terminateConference");

  // Create the ConferenceUpdateOptions and set the status to terminated
  const options = new UpdateConferenceRequest({
    status: ConferenceStatus.TERMINATED,
  });
  freeclimb.updateAConference(conferenceId, options).catch((err) => {
    /* Handle Errors */
  });
}

function lookupAgentPhoneNumber() {
  console.log(
    'Implement this function! have it return phone number of the "agent" you wish to dial"'
  );
  return phonenumberToCall;
}

// Specify this route with 'Status Callback URL' in App Config
app.post("/status", (req, res) => {
  console.log("status");
  // handle status changes
  res.status(200);
});

app.listen(port, () => {
  console.log(`Starting server on port ${port}`);
});
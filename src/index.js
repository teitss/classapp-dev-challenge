const fs = require('fs');
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const _ = require('lodash');
const TAG_REGEX = /[A-zÀ-ú0-9]+/g;
const ROOM_REGEX = /[A-zÀ-ú]*\s\d+/g;
const EMAIL_REGEX = /^([a-zA-Z0-9._-]+@([a-zA-Z0-9_-]+\.)+[a-zA-Z0-9_-]+)$/;
const CSV_REGEX = /[^",]*(,\s+)?[^",]+/g;

let lines;
const studentData = [];
const studentObjects = [];
const output = [];

run();

function run() {
    lines = fs.readFileSync(process.env.INPUT_PATH, 'utf-8').split('\n');
    correctCsvLines(lines).forEach(element => studentData.push(element.match(CSV_REGEX)))
    for (let i = 1; i < studentData.length; i++) {
        studentObjects.push(buildStudentObject(studentData[0], studentData[i]));
    }
    mergeDuplicatedStudentObjects(studentObjects);
    fs.writeFileSync(process.env.OUTPUT_PATH, JSON.stringify(output));
}

function correctCsvLines(array) {
   return array.map(element => element + ',').map(replaceDoubleCommas);
}

function replaceDoubleCommas(string) {
    if (string.indexOf(',,') === -1) {
        return string;
    }
    return replaceDoubleCommas(string.replace(',,', ',null,'))
}


function buildStudentObject(headers, data) {
    let studentEntry = {
        classes: [],
        addresses: []
    }
    for (let i=0; i < headers.length; i++) {

        if (headers[i] == 'class') {
            let rooms = data[i].match(ROOM_REGEX);
            if (rooms !== null) {
                studentEntry.classes = [...studentEntry.classes, ...rooms];
            } 
            continue;
        }

        if (containsTag(headers[i])) {
            let tags = headers[i].match(TAG_REGEX);
            let beautifiedData = [];

            if (tags[0] === 'phone') {
                try {
                    let phone = phoneUtil.parse(data[i], 'BR');
                    if(phoneUtil.isValidNumber(phone)) {
                        beautifiedData.push(`${phone.getCountryCode()}${phone.getNationalNumber()}`);
                    } 
                }
                catch(err) {
                    if (err.message === 'The string supplied did not seem to be a phone number') {
                        continue;
                    }
                    console.error(err);
                }
            }

            if (tags[0] === 'email') {
                let emails = sanitizeEmails(data[i]);
                if (emails.length > 0) {
                    beautifiedData = emails;
                }
            }

            beautifiedData.forEach(element => { 
                let possibleDuplicatedAddress = studentEntry.addresses.find(fElement => fElement.address === element);
                let pdaIndex = studentEntry.addresses.findIndex(fElement => fElement.address === element);
                if (pdaIndex > -1) {
                    possibleDuplicatedAddress.tags = [...possibleDuplicatedAddress.tags, ...tags.slice(1)]
                    studentEntry.addresses.splice(pdaIndex,1,possibleDuplicatedAddress)
                    return;
                } 
                studentEntry.addresses.push({
                    type: tags[0],
                    tags: [...tags.slice(1)],
                    address: element
                })
            });
            
            continue;
        }

        if (headers[i] === 'invisible' || headers[i] === 'see_all') {
            studentEntry[headers[i]] = parseBoolean(data[i]);
            continue;
        }
        
        studentEntry[headers[i]] = data[i];
    }
    if (studentEntry.classes.length === 1) {
        studentEntry.classes = studentEntry.classes[0];
    }
    return studentEntry;
}

function containsTag(string) {
    return string.includes('phone') || string.includes('email');
}

function sanitizeEmails(string) {
    return string.split('/').filter(email => EMAIL_REGEX.test(email));
}

function parseBoolean(string) {
    switch(string) {
        case true:
        case "true":
        case 1:
        case "1":
        case "on":
        case "yes":
            return true;
        default: 
            return false;
    }
}

function mergeDuplicatedStudentObjects(array) {
    array.sort((a,b) => a.eid - b.eid);
    let i = 0
    while(i < array.length) {
        let result = mergeObjects(array[i], array, i+1)
        output.push(result.mergedObject);
        i = result.currentOffset;
    }
}

function mergeObjects(src, array, currentOffset) {
    let obj = array[currentOffset];

    if (typeof obj === 'undefined' ||  src.eid !== obj.eid) {
        return { mergedObject: src, currentOffset };
    }

    newSrc = _.mergeWith(src, obj, (objValue, srcValue) => {
        if (_.isArray(objValue)) {
          return objValue.concat(srcValue);
        }
        if(typeof objValue === 'boolean') {
            return objValue || srcValue;
        }
    });
    return mergeObjects(newSrc, array, currentOffset + 1);
}
import _ from 'lodash'
let CryptoJS = require("crypto-js");
import {deepFlush} from '/lib/js/utilities'
import './participant.form.html'
import Participants from '/imports/collections/participants'
import IDs from '/imports/collections/ids'
import '/imports/ui/components/loader/loader'

// Sentry.io

let raven = require('raven');
let client = new raven.Client('https://7b01834070004a4a91b5a7ed14c0b411:79de4d1bd9f24d1a93b78b18750afb54@sentry.io/126769', {
  environment: Meteor.settings.public.environment,
  tags: {section: 'participant.form'}
});

// catches all exceptions on the server
// raven.patchGlobal(client);

client.on('logged', function () {
  console.log('Exception handled and sent to Sentry.io');
});

client.on('error', function (e) {
  // The event contains information about the failure:
  //   e.reason -- raw response body
  //   e.statusCode -- response status code
  //   e.response -- raw http response object

  console.log('Couldn\'t connect to Sentry.io');
});


Template.UserFormSection.onCreated(function () {
  let template = Template.instance();

  // set _id session variable when editing
  // participant in external cp list
  setSessions();

  let _id = Session.get('_id') || Meteor.userId();

  // if user is admin then set this as true since not needed
  template.hasAcceptedTandC = new ReactiveVar(!!Roles.userIsInRole(Meteor.userId(), 'admin'));

  template.uploadingSID = new ReactiveVar(false);
  template.uploadingPID = new ReactiveVar(false);
  template.filling = new ReactiveVar(true);


  // set sentry.io context and catch all exceptions
  client.setContext({
    user: Meteor.user()
  });

  // subscriptions
  this.subscribe("users.current");

  this.subscribe("participants.current", _id, function () {
    let p = Participants.findOne();
    if (p) {

      // again, if admin the set true since not needed
      let acceptTandC = (Roles.userIsInRole(Meteor.userId(), 'admin') ? true : p.hasAcceptedTandC);
      template.hasAcceptedTandC.set(acceptTandC);
      template.filling.set(!p.statusComplete);
    }
  });
});

Template.UserFormSection.onRendered(function () {
  // Meteor.autorun(function () {
  //   let lp = Participants.findOne();
  //   setCheckboxes(lp)
  // });
});

Template.UserFormSection.helpers({
  uploadingSID: function () {
    return Template.instance().uploadingSID.get();
  },
  uploadingPID: function () {
    return Template.instance().uploadingPID.get();
  },
  imageFile: function () {
    return IDs.findOne();
  },
  lp: function () {
    setSessions();
    let _id = Session.get('_id');
    return Participants.findOne({_id: _id});
  },
  hasAcceptedTandC: function () {
    let template = Template.instance();
    return (template.hasAcceptedTandC ? template.hasAcceptedTandC.get() : false)
  },
  complete: function () {
    let p = Participants.findOne();
    let filling = Template.instance().filling.get();

    // if admin never show the completed message
    if (Roles.userIsInRole(Meteor.userId(), 'admin')) return false;

    return (p && !filling ? p.statusComplete : false);
  },

  isExternal: function () {

    // since external participants (not cp) do not have an account
    // here it checks whether is neither unibz nor admin
    return !Roles.userIsInRole(Session.get('_id'), ['unibz', 'admin'])
  }
});

Template.UserFormSection.events({
  // form submission
  'submit #user_form': function (event, template) {
    event.preventDefault();

    // values from form elements
    const target = event.target;

    // saving spinner
    $(target.save).text('Loading...');

    const isAdmin = Roles.userIsInRole(Meteor.userId(), 'admin');

    let _id = Session.get('_id');
    let p = Participants.findOne({_id: _id});
    if (!p.hasPersonalID && !isAdmin) {
      $(target.save).text('Save');
      return swal('Error', 'You need to upload your personal ID!', 'warning');
    }

    if (!p.hasStudentID && !isAdmin) {
      $(target.save).text('Save');
      return swal('Error', 'You need to upload your personal ID!', 'warning');
    }

    let parsedDate = _.replace(target.birth_date.value, /\//g, '-');
    let splitDate = parsedDate.split('-');
    if (_.isEqual(splitDate[0].length, 2))
      parsedDate = splitDate[2] + '-' + splitDate[1] + '-' + splitDate[0];

    // TODO: if first name and last name changes either disable or change user info

    const participant = {
      _id: _id,
      firstName: target.first_name.value,
      lastName: target.last_name.value,
      email: target.email.value,
      gender: target.gender.value,
      phone: target.phone.value,
      // university: target.university.value,
      info: {
        street: target.street.value,
        number: target.number.value,
        city: target.city.value,
        zip: _.toInteger(target.zip.value),
        province: target.province.value,
        country: target.country.value
      },
      birth: {
        date: parsedDate,
        country: target.birth_country.value
      },
      day1: {
        activity: target.d1_activity.value,
        rental: target.d1_rental.value,
      },
      day2: {
        activity: target.d2_activity.value,
        rental: target.d2_rental.value,
        course: target.d2_course.checked
      },
      isVolleyPlayer: target.is_volley_player.checked,
      isFootballPlayer: target.is_football_player.checked,
      foodAllergies: target.food_allergies.value,
      tshirt: target.tshirt.value
    };

    // if not admin, set hasAcceptedTandC to true when saving
    if (!Roles.userIsInRole(Meteor.user(), 'admin')) participant['hasAcceptedTandC'] = true;

    // since SimpleSchema seems not to clean deep properties


    // check if participants object is valid before inserting
    // try {
    //   Participants.simpleSchema().validate(participant);
    // } catch (e) {
    //   // if not valid throw an error
    //   return swal('Error', e.message, 'error')
    // }

    // check security section on Meteor's documentation
    Meteor.call('participants.update', participant, function (error, result) {
      $(target.save).text('Save');

      if (error) {
        swal('Error', error.message, 'error');
      } else {
        swal('Success', 'Profile updated!', 'success');

        if (Roles.userIsInRole(Meteor.user(), 'admin')) {
          $('html, body').animate({scrollTop: 0}, 'fast');
          Session.set('tab', 'AdminListSection');
        }

        if (Roles.userIsInRole(Meteor.user(), 'unibz')) {
          $('html, body').animate({scrollTop: 0}, 'fast');
          template.filling.set(false);
        } else if (_.has(Session.get('tab'), 'previous')) {
          let previous = Session.get('tab')['previous'];
          if (!_.isUndefined(previous)) Session.set('tab', {name: previous})
        }
      }
    })
  },

  // upload files
  'change #has_personal_id': function (e, template) {
    if (e.currentTarget.files && e.currentTarget.files[0]) {
      uploadID(e.currentTarget.files[0], template, 'personal')
    }
  },

  'change #has_student_id': function (e, template) {
    if (e.currentTarget.files && e.currentTarget.files[0]) {
      uploadID(e.currentTarget.files[0], template, 'student')
    }
  },

  'click #acceptTandC': function (e, template) {
    template.hasAcceptedTandC.set(true)
  },

  'click #edit-profile': function (e, template) {
    template.filling.set(true);
  },
});

function setSessions() {
  // _id session variable if _id is property of session variable tab
  if (!_.isUndefined(Session.get('tab')) && _.has(Session.get('tab'), '_id')) Session.set('_id', Session.get('tab')._id);
}

function uploadID(file, template, idType) {
  if (_.isUndefined(Session.get('_id'))) {
    swal('Error', 'A server side error occurred. Please contact rbellon@unibz.it', 'error');
    throw new Meteor.Error('uploadID', 'Session.get(_id) is not defined');
  }

  let p = {_id: Session.get('_id')};
  let key = (_.isEqual(idType, 'personal') ? 'hasPersonalID' : 'hasStudentID');
  p[key] = true;

  // We upload only one file, in case
  // multiple files were selected
  const upload = IDs.insert({
    file: file,
    streams: 'dynamic',
    chunkSize: 'dynamic',
    // transport: 'http',
    meta: {
      type: idType
    }
  }, false);

  upload.on('start', function () {
    $('#has_' + idType + '_id').removeClass('fadeOut').addClass('animated fadeIn');
    $('#loader-label').removeClass('fadeOut').addClass('animated fadeIn');
    template.uploadingPID.set(this);
  });

  upload.on('error', function (error, fileData) {
    if (error) {
      $('#has_' + idType + '_id').removeClass('fadeOut').addClass('animated fadeIn');
      $('#loader-label').removeClass('fadeIn').addClass('animated fadeOut');
      template.uploadingPID.set(this);
      swal('Error', error.message, 'error')
    }
  });

  upload.on('end', function (error, fileObj) {
    if (error) {
      swal('Error', 'Error during upload: ' + error, 'error');
    } else {
      swal('Uploaded', 'Your ' + idType + ' id has been uploaded!', 'success');

      // check security section on Meteor's documentation
      Meteor.call('participants.update', p, function (error, result) {
        if (error) swal('Error', error.message, 'error');
      })
    }
    $('#loader-label').removeClass('fadeIn').addClass('animated fadeOut');
    template.uploadingPID.set(false);
  });

  upload.start();
}

Template.registerHelper("selectedIf", function (left, right) {
  return left == right ? "selected" : "";
});
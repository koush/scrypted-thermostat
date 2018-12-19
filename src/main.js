function VirtualDevice() {
  // determine what is available. undefined stuff will throw;
  try {
    this.heater = heater;
  }
  catch (e) {
  }
  try {
    this.cooler = cooler;
  }
  catch (e) {
  }
}

// whenever the temperature changes, or a new command is sent, this updates the current state accordingly.
VirtualDevice.prototype.updateState = function() {
  var heater = this.heater;
  var cooler = this.cooler;

  var threshold = 2;

  var thermostatMode = this.getThermostatMode();

  if (!thermostatMode) {
    log.e('thermostat mode not set');
    return;
  }

  // this holds the last known state of the thermostat.
  // ie, what it decided to do, the last time it updated its state.
  var thermostatState = scriptConfiguration.getString('thermostatState');

  // set the state before turning any devices on or off.
  // on/off events will need to be resolved by looking at the state to
  // determine if it is manual user input.
  function setState(state) {
    if (state == thermostatState) {
      // log.i('Thermostat state unchanged. ' + state)
      return;
    }

    log.i('Thermostat state changed. ' + state);
    scriptConfiguration.putString('thermostatState', state);
  }

  function manageSetpoint(temperatureDifference, er, other, ing, ed) {
    if (!er) {
      log.e('Thermostat mode set to '+ thermostatMode + ', but ' + thermostatMode.lower() + 'er variable is not defined.');
      return;
    }

    // turn off the other one. if heating, turn off cooler. if cooling, turn off heater.
    if (other) {
      other.turnOff();
    }

    if (temperatureDifference < 0) {
      setState(ed);
      er.turnOff();
      return;
    }

    // start cooling/heating if way over threshold, or if it is not in the cooling/heating state
    if (temperatureDifference > threshold || thermostatState != ing) {
      setState(ing);
      er.turnOn();
      return;
    }

    setState(ed);
    er.turnOff();
  }

  function allOff() {
    if (heater) {
      heater.turnOff();
    }
    if (cooler) {
      cooler.turnOff();
    }
  }

  if (thermostatMode == 'Off') {
    setState('Off');
    allOff();
    return;

  } else if (thermostatMode == 'Cool') {
    
    var thermostatSetpoint = this.getTemperatureSetpoint();
    if (!thermostatSetpoint) {
      log.e('No thermostat setpoint is defined.');
      return;
    }

    var temperatureDifference = this.getTemperatureAmbient() - thermostatSetpoint;
    manageSetpoint(temperatureDifference, cooler, heater, 'Cooling', 'Cooled');
    return;

  } else if (thermostatMode == 'Heat') {

    var thermostatSetpoint = this.getTemperatureSetpoint()
    if (!thermostatSetpoint) {
      log.e('No thermostat setpoint is defined.');
      return;
    }

    var temperatureDifference = thermostatSetpoint - this.getTemperatureAmbient();
    manageSetpoint(temperatureDifference, heater, cooler, 'Heating', 'Heated');
    return;

  } else if (thermostatMode == 'HeatCool') {

    var temperatureAmbient = this.getTemperatureAmbient();
    var temperatureSetpointLow = this.getTemperatureSetpointLow();
    var temperatureSetpointHigh = this.getTemperatureSetpointHigh();

    if (!temperatureSetpointLow || !temperatureSetpointHigh) {
      log.e('No thermostat setpoint low/high is defined.');
      return;
    }

    // see if this is within HeatCool tolerance. This prevents immediately cooling after heating all the way to the high setpoint.
    if ((thermostatState == 'HeatCooled' || thermostatState == 'Heated' || thermostatState == 'Cooled')
      && temperatureAmbient > temperatureSetpointLow - threshold
      && temperatureAmbient < temperatureSetpointHigh + threshold) {
      // normalize the state into HeatCooled
      setState('HeatCooled');
      allOff();
      return;
    }

    // if already heating or cooling or way out of tolerance, continue doing it until state changes.
    if (temperatureAmbient < temperatureSetpointLow || thermostatState == 'Heating') {
      var temperatureDifference = thermostatSetpointHigh - temperatureAmbient;
      manageSetpoint(temperatureDifference, heater, 'Heating', 'Heated');
      return;
    } else if (temperatureAmbient > temperatureSetpointHigh || thermostatState == 'Cooling') {
      var temperatureDifference = temperatureAmbient - thermostatSetpointLow;
      manageSetpoint(temperatureDifference, cooler, 'Cooling', 'Cooled');
      return;
    }

    // temperature is within tolerance, so this is now HeatCooled
    setState('HeatCooled');
    allOff();
    return;
  }

  log.e('Unknown mode ' + thermostatMode)
};

// implementation of TemperatureSetting

VirtualDevice.prototype.getHumidityAmbient = function() {
  return humidity.getHumidityAmbient();
};

VirtualDevice.prototype.getTemperatureAmbient = function() {
  return thermometer.getTemperatureAmbient();
};

VirtualDevice.prototype.getTemperatureUnit = function() {
  var unit = thermometer.getTemperatureUnit();
  if (unit) {
    scriptConfiguration.putString('thermometerUnitLastSeen', unit);
    return unit;
  }

  return scriptConfiguration.getString('thermometerUnitLastSeen');
}

VirtualDevice.prototype.getTemperatureSetpoint = function() {
  return scriptConfiguration.getDouble("thermostatTemperatureSetpoint");
}

VirtualDevice.prototype.getTemperatureSetpointHigh = function() {
  return scriptConfiguration.getDouble("thermostatTemperatureSetpointHigh");
};

VirtualDevice.prototype.getTemperatureSetpointLow = function() {
  return scriptConfiguration.getDouble("thermostatTemperatureSetpointLow");
};

VirtualDevice.prototype.getThermostatMode = function() {
  return scriptConfiguration.getString("thermostatMode");
};

VirtualDevice.prototype.getAvailableThermostatModes = function() {
  var modes = [];
  modes.push('Off')
  if (this.cooler) {
    modes.push('Cool');
  }
  if (this.heater) {
    modes.push('Heat');
  }
  if (this.heater && this.cooler) {
    modes.push('HeatCool');
  }
  modes.push('On');

  return modes;
};

VirtualDevice.prototype.setTemperatureSetpoint = function(arg0) {
  log.i('thermostatTemperatureSetpoint changed ' + arg0);
  scriptConfiguration.putDouble("thermostatTemperatureSetpoint", arg0);
  this.updateState();
};

VirtualDevice.prototype.setTemperatureSetRange = function(low, high) {
  log.i('thermostatTemperatureSetpointRange changed ' + low + ' ' + high);
  scriptConfiguration.putDouble("thermostatTemperatureSetpointLow", low);
  scriptConfiguration.putDouble("thermostatTemperatureSetpointHigh", high);
  this.updateState();
};

VirtualDevice.prototype.setThermostatMode = function(mode) {
  log.i('thermostat mode set to ' + mode);
  if (mode == 'On') {
    mode = scriptConfiguration.getString("lastThermostatMode");
  }
  else if (mode != 'Off') {
    scriptConfiguration.putString("lastThermostatMode", mode);
  }
  scriptConfiguration.putString("thermostatMode", mode);
  this.updateState();
};

// end implementation of TemperatureSetting

// If the heater or cooler gets turned on or off manually (or programatically),
// make this resolve with the current state. This relies on the state being set
// before any devices are turned on or off (as mentioned above) to avoid race
// conditions.
VirtualDevice.prototype.manageEvent = function(on, ing) {
  var state = scriptConfiguration.getString('thermostatState');
  if (on) {
    // on implies it must be heating/cooling
    if (state != ing) {
      // should this be Heat/Cool?
      this.setThermostatMode('On');
      return;
    }
    return;
  }

  // off implies that it must NOT be heating/cooling
  if (state == ing) {
    this.setThermostatMode('Off');
    return;
  }
};

var virtualDevice = new VirtualDevice();

// register to listen for temperature change events
thermometer.on('Thermometer', function() {
  virtualDevice.updateState();
});

// Watch for on/off events, some of them may be physical
// button presses, and those will need to be resolved by
// checking the state versus the event.
if (virtualDevice.heater) {
  virtualDevice.heater.on('OnOff', function(source, on) {
    virtualDevice.manageEvent(on, 'Heating');
  });
}
if (virtualDevice.cooler) {
  virtualDevice.cooler.on('OnOff', function(source, on) {
    virtualDevice.manageEvent(on, 'Cooling');
  });
}

exports.result = virtualDevice;

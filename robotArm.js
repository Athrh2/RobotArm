"use strict";

var canvas, gl, program;

// --- CAMERA VARIABLES ---
var camX = 30; // Initial Tilt
var camY = 25; // Initial Pan

// --- JOINT VARIABLES ---
var theta = [0, 25, 80, 90]; 
var BASE = 0, LOWER_ARM = 1, UPPER_ARM = 2, WRIST = 3;

const FLOOR_Y = -2.1;
const FLOOR_LIMIT_Y = FLOOR_Y + 0.05;    // hard stop 
const FLOOR_SOFT_RED_Y = FLOOR_Y + 0.3; // visual limit (red)
const FLOOR_WARNING_Y = FLOOR_Y + 0.7;   // EARLY warning (yellow)

const GRIPPER_TIP_OFFSET = 1.8; // Distance from wrist pivot to gripper tip

const FLOOR_THICKNESS = 0.2;
const FLOOR_TOP_Y = FLOOR_Y + FLOOR_THICKNESS / 2;

const OBJECT_SIZE = 0.8;
const OBJECT_HALF = OBJECT_SIZE / 2;

// --- MODERN DIMENSIONS ---
var BASE_H = 1.2, BASE_W = 3.0; 
var LOWER_H = 4.5, LOWER_W = 0.7;
var UPPER_H = 4.0, UPPER_W = 0.5;

// --- MODERN COLORS ---
var COLORS = {
    BASE_BLACK: vec4(0.15, 0.15, 0.15, 1.0),
    BASE_GREY:  vec4(0.55, 0.55, 0.55, 1.0),
    ARM_ORANGE: vec4(1.0, 0.52, 0.12, 1.0),
    JOINT_DARK: vec4(0.08, 0.08, 0.08, 1.0),
    GRIPPER:    vec4(0.12, 0.12, 0.13, 1.0),
    OBJECT:     vec4(0.95, 0.20, 0.20, 1.0),
    FLOOR:      vec4(0.52, 0.45, 0.40, 1.0) 
};

// --- MATRICES ---
var modelViewMatrix, modelViewMatrixLoc, viewMatrix; 
var points = [];
var normals = [];

// --- OBJECT VARIABLES ---
var gripperGap = 0.2;         
var isObjectCaught = false;   
var objectPosition = vec3(5.0, FLOOR_TOP_Y + OBJECT_HALF, 0.0);
var trueWristPosition = vec3(0, 0, 0); 

// --- AUTOMATION VARIABLES ---
var isAutomating = false;
var automationStep = 0; 
var lerpSpeed = 1.5; 

var vertices = [
    vec3(-0.5, -0.5,  0.5), vec3(-0.5,  0.5,  0.5),
    vec3( 0.5,  0.5,  0.5), vec3( 0.5, -0.5,  0.5),
    vec3(-0.5, -0.5, -0.5), vec3(-0.5,  0.5, -0.5),
    vec3( 0.5,  0.5, -0.5), vec3( 0.5, -0.5, -0.5)
];

var lightPosition = vec4(10.0, 15.0, 10.0, 1.0);
var lightAmbient  = vec4(0.25, 0.25, 0.25, 1.0);
var lightDiffuse  = vec4(0.7, 0.7, 0.7, 1.0);
var lightSpecular = vec4(0.6, 0.6, 0.6, 1.0);

var materialAmbient  = vec4(1.0, 1.0, 1.0, 1.0);
var materialDiffuse  = vec4(1.0, 1.0, 1.0, 1.0);
var materialSpecular = vec4(0.8, 0.8, 0.8, 1.0);
var materialShininess = 40.0;

function quad(a, b, c, d) {
    var t1 = subtract(vertices[b], vertices[a]);
    var t2 = subtract(vertices[c], vertices[a]);
    var normal = normalize(vec3(cross(t1, t2)));
    var indices = [a, b, c, a, c, d];
    for (var i = 0; i < indices.length; i++) {
        points.push(vertices[indices[i]]);
        normals.push(normal);
    }
}

function colorCube() {
    quad(1, 0, 3, 2); quad(2, 3, 7, 6);
    quad(3, 0, 4, 7); quad(6, 5, 1, 2);
    quad(4, 5, 6, 7); quad(5, 4, 0, 1);
}

function normalMatrixFromMatrix4(m) {
    return transpose(inverse(mat3(
        m[0][0], m[0][1], m[0][2],
        m[1][0], m[1][1], m[1][2],
        m[2][0], m[2][1], m[2][2]
    )));
}

function drawSolidCube(w, h, d, color, shininess) {
    var s = scale(w, h, d);
    var instanceMatrix = mult(modelViewMatrix, s);
    
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    
    var nMatrix = normalMatrixFromMatrix4(instanceMatrix);
    gl.uniformMatrix3fv(gl.getUniformLocation(program, "normalMatrix"), false, flatten(nMatrix));

    // Adjust ambient for different materials
    var ambientMult = vec4(0.6, 0.6, 0.6, 1.0);
    gl.uniform4fv(gl.getUniformLocation(program, "ambientProduct"), 
                  flatten(mult(lightAmbient, mult(color, ambientMult))));
    gl.uniform4fv(gl.getUniformLocation(program, "diffuseProduct"), 
                  flatten(mult(lightDiffuse, color)));
    gl.uniform4fv(gl.getUniformLocation(program, "specularProduct"), 
                  flatten(lightSpecular));
    
    // Use custom shininess if provided, otherwise default
    var shine = shininess !== undefined ? shininess : materialShininess;
    gl.uniform1f(gl.getUniformLocation(program, "shininess"), shine);
    
    gl.drawArrays(gl.TRIANGLES, 0, 36);
}

// --- JOINT LIMITS (DEGREES) ---
const JOINT_LIMITS = {
    BASE:  { min: -180, max: 180 },
    LOWER: { min: 0,  max: 90  },
    UPPER: { min: 40,    max: 135 },
    WRIST: { min: 0,    max: 180 }
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function computeGripperWorldY(lowerDeg, upperDeg) {
    const radL = lowerDeg * Math.PI / 180;
    const radU = (lowerDeg + upperDeg) * Math.PI / 180;

    // World Y of wrist pivot
    const wristWorldY =
        -2.0 +
        BASE_H +
        LOWER_H * Math.cos(radL) +
        UPPER_H * Math.cos(radU);

    // True lowest point (finger tip)
    return wristWorldY - GRIPPER_TIP_OFFSET;
}

function isMovementSafe(nextLower, nextUpper) {
    const gripperY = computeGripperWorldY(nextLower, nextUpper);

    // Absolute physical rule (hard stop)
    return gripperY > FLOOR_LIMIT_Y;
}

function getLimitState(jointIndex, value, limits) {
    if (value <= limits.min || value >= limits.max) return "limit";

    const threshold = 10;
    if (value <= limits.min + threshold || value >= limits.max - threshold)
        return "near";

    return "normal";
}

function updateSliderUI() {
    const sliders = ["slider1", "slider2", "slider3", "slider4"]
        .map(id => document.getElementById(id));

    const limits = [
        JOINT_LIMITS.BASE,
        JOINT_LIMITS.LOWER,
        JOINT_LIMITS.UPPER,
        JOINT_LIMITS.WRIST
    ];

    const currentY = computeGripperWorldY(
        theta[LOWER_ARM],
        theta[UPPER_ARM]
    );

    let floorState = "normal";
    if (currentY <= FLOOR_SOFT_RED_Y) {
        floorState = "limit";
    } else if (currentY <= FLOOR_WARNING_Y) {
        floorState = "near";
    }

    // ---- Apply UI ----
    sliders.forEach((s, i) => {
        if (!s) return;
        s.value = theta[i];

        let state = "normal";

        // Apply floor warning to BOTH LOWER & UPPER
        if (i === LOWER_ARM || i === UPPER_ARM) {
            state = floorState;
        }

        // Joint mechanical limits override
        const limitState = getLimitState(i, theta[i], limits[i]);

        // Mechanical RED overrides everything
        if (limitState === "limit") {
            state = "limit";
        }
        // Floor warning should not be erased
        else if (state === "normal") {
            state = limitState;
        }


        s.classList.remove("range-normal", "range-near", "range-limit");
        s.classList.add(
            state === "limit" ? "range-limit" :
            state === "near"  ? "range-near"  :
                                "range-normal"
        );
    });

    updateLabel("baseLabel",  theta[BASE],      JOINT_LIMITS.BASE,  BASE);
    updateLabel("lowerLabel", theta[LOWER_ARM], JOINT_LIMITS.LOWER, LOWER_ARM);
    updateLabel("upperLabel", theta[UPPER_ARM], JOINT_LIMITS.UPPER, UPPER_ARM);
    updateLabel("wristLabel", theta[WRIST],     JOINT_LIMITS.WRIST, WRIST);
    console.log(
    "Gripper Y:", currentY.toFixed(2),
    "State:", floorState
    );
}

function updateLabel(id, value, limits, index) {
    const label = document.getElementById(id);
    if (!label) return;
    label.innerHTML = value + "°";

    const state = getLimitState(index, value, limits);
    if (state === "limit") {
        label.style.color = "#dc3545"; // Red
    } else if (state === "near") {
        label.style.color = "#ffc107"; // Yellow/Orange
    } else {
        label.style.color = "#444"; // Default
    }
}

function performGrab() {
    var msg = document.getElementById("statusLabel");
    if(isObjectCaught) {
        isObjectCaught = false; 
        gripperGap = 0.2; 
        objectPosition = vec3(
            trueWristPosition[0],
            FLOOR_TOP_Y + OBJECT_HALF,
            trueWristPosition[2]
        );
        if(msg) {
            msg.style.color = "#28a745";
            msg.innerHTML = "Object Dropped";
        }
    } else {
        var dx = trueWristPosition[0] - objectPosition[0];
        var dy = trueWristPosition[1] - objectPosition[1];
        var dz = trueWristPosition[2] - objectPosition[2];
        var dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist < 1.4) { 
            isObjectCaught = true; 
            gripperGap = 0.0; 
            if(msg) {
                msg.style.color = "#28a745";
                msg.innerHTML = "Object Picked Up!";
            }
        } else {
            if(msg) {
                msg.style.color = "#dc3545";
                msg.innerHTML = "Too far! Move closer (" + dist.toFixed(1) + ")";
            }
        }
    }
}

function toggleManualControls(enable) {
    ["slider1","slider2","slider3","slider4","grabBtn"].forEach(id => {
        var elem = document.getElementById(id);
        if (elem) elem.disabled = !enable;
    });
}   
    
function handleAutomation() {
    if (!isAutomating) {
        toggleManualControls(true);
        return;
    }

    if ((automationStep > 3 && automationStep < 7) && !isObjectCaught) {
        isAutomating = false;
        automationStep = 0;
        return;
    }
    toggleManualControls(false);

    function moveToward(index, target, speed = lerpSpeed) {
        if (Math.abs(theta[index] - target) < speed) {
            theta[index] = target;
            return true;
        }
        let nextStep = theta[index] + (theta[index] < target ? speed : -speed);
        
        // NEW SAFETY CHECK: If this is an arm joint, check the floor before moving
        if (index === LOWER_ARM) {
            if (!isMovementSafe(nextStep, theta[UPPER_ARM])) return false; // Stop moving
        }
        if (index === UPPER_ARM) {
            if (!isMovementSafe(theta[LOWER_ARM], nextStep)) return false; // Stop moving
        }

        theta[index] = nextStep;

        if ((index === LOWER_ARM || index === UPPER_ARM) &&
            !isMovementSafe(
                index === LOWER_ARM ? theta[index] : theta[LOWER_ARM],
                index === UPPER_ARM ? theta[index] : theta[UPPER_ARM]
            )) {
            return true; // stop automation step safely
        }

        // APPLY LIMITS
        if (index === BASE)
            theta[index] = clamp(theta[index], JOINT_LIMITS.BASE.min, JOINT_LIMITS.BASE.max);
        if (index === LOWER_ARM)
            theta[index] = clamp(theta[index], JOINT_LIMITS.LOWER.min, JOINT_LIMITS.LOWER.max);
        if (index === UPPER_ARM)
            theta[index] = clamp(theta[index], JOINT_LIMITS.UPPER.min, JOINT_LIMITS.UPPER.max);
        if (index === WRIST)
            theta[index] = clamp(theta[index], JOINT_LIMITS.WRIST.min, JOINT_LIMITS.WRIST.max);

        return false;
    }

    var msg = document.getElementById("statusLabel");

    switch (automationStep) {
        case 1:
            if(msg) {
                msg.style.color = "#2850a7ff";
                msg.innerHTML = "Auto: Aligning Base...";
            }
            if (moveToward(BASE, -180)) automationStep = 2;
            break;
        case 2:
            if(msg) {
                msg.style.color = "#2850a7ff";
                msg.innerHTML = "Auto: Reaching for Object...";
            }
            var lReached = moveToward(LOWER_ARM, 30);
            var uReached = moveToward(UPPER_ARM, 105); 
            if (lReached && uReached) automationStep = 3;
            break;
        case 3:
            performGrab();
            if(isObjectCaught) {
                automationStep = 4;
            } else {
                isAutomating = false;
            }
            break;
        case 4:
            if(msg) {
                msg.style.color = "#2850a7ff";
                msg.innerHTML = "Auto: Lifting...";
            }
            var lLifted = moveToward(LOWER_ARM, 10);
            var uLifted = moveToward(UPPER_ARM, 90);
            if (lLifted && uLifted) automationStep = 5;
            break;
        case 5:
            if(msg) {
                msg.style.color = "#2850a7ff";
                msg.innerHTML = "Auto: Moving to Drop...";
            }
            if (moveToward(BASE, 5)) automationStep = 6;
            break;
        case 6:
            if(msg) {
                msg.style.color = "#2850a7ff";
                msg.innerHTML = "Auto: Positioning for Drop...";
            }
            var lDropPos = moveToward(LOWER_ARM, 35);
            var uDropPos = moveToward(UPPER_ARM, 95);
            if (lDropPos && uDropPos) automationStep = 7;
            break;
        case 7:
            if(msg) {
                msg.style.color = "#2850a7ff";
                msg.innerHTML = "Auto: Releasing Object...";
            }
            isObjectCaught = false;
            gripperGap = 0.2;
            objectPosition = vec3(
                trueWristPosition[0],
                FLOOR_TOP_Y + OBJECT_HALF,
                trueWristPosition[2]
            );
            isAutomating = false; 
            automationStep = 0;
            if(msg) {
                msg.style.color = "#28a745";
                msg.innerHTML = "Task Complete!";
            }
            break;
    }
    updateSliderUI();
}

window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) { alert("WebGL isn't available"); }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.9, 0.9, 0.95, 1.0);
    gl.enable(gl.DEPTH_TEST);

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    if (!program) {
        console.error("Shader program failed!");
        return;
    }
    gl.useProgram(program);
    gl.uniform4fv(gl.getUniformLocation(program, "specularProduct"), flatten(lightSpecular));
    gl.uniform4fv(gl.getUniformLocation(program, "lightPosition"), flatten(lightPosition));
    gl.uniform1f(gl.getUniformLocation(program, "shininess"), materialShininess);

    colorCube();

    // ===== POSITION BUFFER =====
    var vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);

    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    var nBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normals), gl.STATIC_DRAW);

    var vNormal = gl.getAttribLocation(program, "vNormal");
    gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vNormal);

    modelViewMatrixLoc = gl.getUniformLocation(program, "modelViewMatrix");
    var projectionMatrix = ortho(-15, 15, -10, 10, -50, 50);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(projectionMatrix));

    // UI Listeners
    document.getElementById("camTilt").oninput = e => {
        camX = parseFloat(e.target.value);
        var modeLabel = document.getElementById("statusLabel");
        if (modeLabel) {
            modeLabel.style.color = "#6c757d";
            modeLabel.innerHTML = "Manual Control (Slider)";
        }
    };

    document.getElementById("camPan").oninput = e => {
        camY = parseFloat(e.target.value);
        var modeLabel = document.getElementById("statusLabel");
        if (modeLabel) {
            modeLabel.style.color = "#6c757d";
            modeLabel.innerHTML = "Manual Control (Slider)";
        }
    };

    document.getElementById("slider1").oninput = e => { 
        theta[BASE] = clamp(parseFloat(e.target.value), JOINT_LIMITS.BASE.min, JOINT_LIMITS.BASE.max);
        isAutomating = false;
        updateSliderUI();
        var modeLabel = document.getElementById("statusLabel");
        if (modeLabel) {
            modeLabel.style.color = "#6c757d";
            modeLabel.innerHTML = "Manual Control (Slider)";
        }
    };
    document.getElementById("slider2").oninput = e => { 
    var val = parseFloat(e.target.value);
    // CHECK: Is the new Lower Arm angle safe with the CURRENT Upper Arm angle?
    if (isMovementSafe(val, theta[UPPER_ARM])) {
        theta[LOWER_ARM] = val;
    } else {
        // REJECT: Reset the slider to the last known good value
        e.target.value = theta[LOWER_ARM]; // Snap slider back
    }
        isAutomating = false; 
        updateSliderUI();
        var modeLabel = document.getElementById("statusLabel");
        if (modeLabel) {
            modeLabel.style.color = "#6c757d";
            modeLabel.innerHTML = "Manual Control (Slider)";
        }
    };
    document.getElementById("slider3").oninput = e => { 
    var val = parseFloat(e.target.value);
    // CHECK: Is the CURRENT Lower Arm angle safe with the NEW Upper Arm angle?
    if (isMovementSafe(theta[LOWER_ARM], val)) {
        theta[UPPER_ARM] = val;
    } else {
        // REJECT: Reset the slider to the last known good value
        e.target.value = theta[UPPER_ARM];
    }        isAutomating =  false; 
        updateSliderUI();
        var modeLabel = document.getElementById("statusLabel");
        if (modeLabel) {
            modeLabel.style.color = "#6c757d";
            modeLabel.innerHTML = "Manual Control (Slider)";
        }
    };
    document.getElementById("slider4").oninput = e => { 
        theta[WRIST] = clamp(parseFloat(e.target.value), JOINT_LIMITS.WRIST.min, JOINT_LIMITS.WRIST.max);
        isAutomating = false; 
        updateSliderUI();
        var modeLabel = document.getElementById("statusLabel");
        if (modeLabel) {
            modeLabel.style.color = "#6c757d";
            modeLabel.innerHTML = "Manual Control (Slider)";
        }
    };
    document.getElementById("grabBtn").onclick = function() { 
        isAutomating = false; performGrab(); 
    };
    document.getElementById("autoStartStopBtn").onclick = function() { 
        if (!isAutomating) {
            isAutomating = true;
            if (automationStep === 0) automationStep = 1; 
        } else {
            isAutomating = false;
            toggleManualControls(true);
        }
    };
    document.getElementById("autoResetBtn").onclick = function() {
        isAutomating = false; 
        automationStep = 0; 
        toggleManualControls(true);
        theta = [0, 25, 80, 90]; 
        isObjectCaught = false; 
        gripperGap = 0.2;
        objectPosition = vec3(5.0, FLOOR_TOP_Y + OBJECT_HALF, 0.0);
        updateSliderUI();
        var msg = document.getElementById("statusLabel");
        if(msg) {
            msg.style.color = "#000";
            msg.innerHTML = "System Reset: Ready";
        }
    };
    
    // KEYBOARD CONTROLS
    window.addEventListener("keydown", function(e) {    
        const key = e.key.toLowerCase();
        const modeLabel = document.getElementById("statusLabel");

        if (key === 'r') { 
            document.getElementById("autoResetBtn").click(); 
            return; 
        }

        if (key === " ") { 
            e.preventDefault(); 
            document.getElementById("autoStartStopBtn").click();
            return;
        }

        if (isAutomating) return; 

        const step = 3;
        let updated = false;
        
        switch (key) {
            case 'a':
                theta[BASE] = clamp(theta[BASE] - step, JOINT_LIMITS.BASE.min, JOINT_LIMITS.BASE.max);
                updated = true;
                break;
            case 'd':
                theta[BASE] = clamp(theta[BASE] + step, JOINT_LIMITS.BASE.min, JOINT_LIMITS.BASE.max);
                updated = true;
                break;
            case 'w':
                theta[LOWER_ARM] = clamp(theta[LOWER_ARM] + step, JOINT_LIMITS.LOWER.min, JOINT_LIMITS.LOWER.max);
                updated = true;
                break;
            case 's':
                var nextL = theta[LOWER_ARM] - step;
                if (isMovementSafe(nextL, theta[UPPER_ARM])) {
                    theta[LOWER_ARM] = clamp(nextL, JOINT_LIMITS.LOWER.min, JOINT_LIMITS.LOWER.max);
                    updated = true;
                }
                break;
            case 'i':
                theta[UPPER_ARM] = clamp(theta[UPPER_ARM] + step, JOINT_LIMITS.UPPER.min, JOINT_LIMITS.UPPER.max);
                updated = true;
                break;
            case 'k':
                var nextU = theta[UPPER_ARM] - step;
                if (isMovementSafe(theta[LOWER_ARM], nextU)) {
                    theta[UPPER_ARM] = clamp(nextU, JOINT_LIMITS.UPPER.min, JOINT_LIMITS.UPPER.max);
                    updated = true;
                }
                break;
            case 'j':
                theta[WRIST] = clamp(theta[WRIST] - step, JOINT_LIMITS.WRIST.min, JOINT_LIMITS.WRIST.max);
                updated = true;
                break;
            case 'l':
                theta[WRIST] = clamp(theta[WRIST] + step, JOINT_LIMITS.WRIST.min, JOINT_LIMITS.WRIST.max);
                updated = true;
                break;
            case "enter": 
                performGrab(); 
                break;
        }

        if (updated) {
            updateSliderUI();
            if (modeLabel) {
                modeLabel.style.color = "#007bff";
                modeLabel.innerHTML = "Manual Control (Keyboard)";
            }
        }
    });
    
    updateSliderUI();
    render();
};

// GRIPPER - Downward facing with auto-leveling
function drawGripper(rootMatrix) {
    // Add slight separation outline effect when gripper is closed
    var fingerSeparation = gripperGap < 0.05 ? 0.05 : gripperGap;
    
    // Mounting base plate
    modelViewMatrix = mult(rootMatrix, translate(0, -0.2, 0));
    drawSolidCube(1.2, 0.4, 1.2, COLORS.GRIPPER, 20.0); 

    // Fingers pointing DOWNWARD (use fingerSeparation instead of gripperGap)
    var leftFinger = mult(rootMatrix, translate(-0.4 - fingerSeparation, -1.2, 0)); 
    modelViewMatrix = leftFinger;
    drawSolidCube(0.2, 1.5, 0.4, COLORS.BASE_BLACK, 35.0); 

    var rightFinger = mult(rootMatrix, translate(0.4 + fingerSeparation, -1.2, 0)); 
    modelViewMatrix = rightFinger;
    drawSolidCube(0.2, 1.5, 0.4, COLORS.BASE_BLACK, 35.0); 
}

function render() {
    handleAutomation();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // USE LIVE VARIABLES FOR CAMERA SETUP
    viewMatrix = mult(rotateX(camX), rotateY(camY));

    // TRANSFORM LIGHT INTO VIEW SPACE
    var lightPosView = mult(viewMatrix, lightPosition);
    gl.uniform4fv(
        gl.getUniformLocation(program, "lightPosition"),
        flatten(lightPosView)
    );

    // Floor
    modelViewMatrix = mult(viewMatrix, translate(0, -2.1, 0));
    drawSolidCube(22.0, 0.2, 14.0, COLORS.FLOOR, 5.0);

    // --- ROBOT TRANSFORMATION HIERARCHY ---
    var wRoot = translate(0, -2.0, 0);
    wRoot = mult(wRoot, rotateY(theta[BASE]));

    var wLowerPivot = mult(wRoot, translate(0, BASE_H, 0));
    var wLower = mult(wLowerPivot, rotateZ(theta[LOWER_ARM]));

    var wUpperPivot = mult(wLower, translate(0, LOWER_H, 0));
    var wUpper = mult(wUpperPivot, rotateZ(theta[UPPER_ARM]));

    var totalTilt = theta[LOWER_ARM] + theta[UPPER_ARM];
    var wGripper = mult(wUpper, translate(0, UPPER_H, 0));
    wGripper = mult(wGripper, rotateZ(-totalTilt));

    trueWristPosition = vec3(
        wGripper[0][3],
        wGripper[1][3] - 1.8,
        wGripper[2][3]
    );

    const minWristY = FLOOR_LIMIT_Y + GRIPPER_TIP_OFFSET;
    if (trueWristPosition[1] < minWristY) {
        trueWristPosition[1] = minWristY;
    }

    // Base
    modelViewMatrix = mult(viewMatrix, mult(wRoot, translate(0, 0.1, 0)));
    drawSolidCube(5.0, 0.2, 5.0, COLORS.BASE_BLACK, 40.0);

    modelViewMatrix = mult(viewMatrix, mult(wRoot, translate(0, 0.6, 0)));
    drawSolidCube(3.5, 0.8, 3.5, COLORS.BASE_GREY, 30.0);

    // Lower arm
    modelViewMatrix = mult(viewMatrix, wLowerPivot);
    drawSolidCube(1, 0.4, 1, COLORS.JOINT_DARK, 50.0);

    modelViewMatrix = mult(viewMatrix, mult(wLower, translate(0, LOWER_H / 2, 0)));
    drawSolidCube(LOWER_W, LOWER_H, LOWER_W, COLORS.ARM_ORANGE, 25.0);
    
    // Upper arm
    modelViewMatrix = mult(viewMatrix, wUpperPivot);
    drawSolidCube(1.0, 1.0, 1.0, COLORS.JOINT_DARK, 50.0);

    modelViewMatrix = mult(viewMatrix, mult(wUpper, translate(0, UPPER_H / 2, 0)));
    drawSolidCube(UPPER_W, UPPER_H, UPPER_W, COLORS.ARM_ORANGE, 25.0);

    // Gripper
    var gripperFinalM = mult(viewMatrix, wGripper);
    gripperFinalM = mult(gripperFinalM, rotateY(theta[WRIST]));
    drawGripper(gripperFinalM);

    // Object (Plastic Cube)
    if (isObjectCaught) {
        modelViewMatrix = mult(gripperFinalM, translate(0, -1.8, 0));
    } else {
        modelViewMatrix = mult(
            viewMatrix,
            translate(objectPosition[0], objectPosition[1], objectPosition[2])
        );
    }
    drawSolidCube(0.8, 0.8, 0.8, COLORS.OBJECT, 12.0);

    requestAnimationFrame(render);
}

"use strict";

var canvas, gl, program;

// --- JOINT VARIABLES ---
var theta = [0, 30, 60, 90]; 
var BASE = 0, LOWER_ARM = 1, UPPER_ARM = 2, WRIST = 3;

// --- DIMENSIONS ---
var BASE_H = 1.0, BASE_W = 5.0; 
var LOWER_H = 4.0, LOWER_W = 1.0;
var UPPER_H = 3.5, UPPER_W = 1.0;

// --- MATRICES ---
var modelViewMatrix, modelViewMatrixLoc, vColorLoc, viewMatrix; 
var points = [], colors = [];

// --- OBJECT VARIABLES ---
var gripperGap = 0.2;         
var isObjectCaught = false;   
var objectPosition = vec3(5.0, -1.4, 0.0); 
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

var faceColors = [
    vec4(1.0, 1.0, 0.0, 1.0), vec4(0.0, 1.0, 0.0, 1.0),
    vec4(1.0, 0.0, 0.0, 1.0), vec4(1.0, 1.0, 0.0, 1.0),
    vec4(1.0, 0.0, 1.0, 1.0), vec4(0.0, 1.0, 1.0, 1.0)
];

function quad(a, b, c, d, colorIndex) {
    var indices = [a, b, c, a, c, d];
    for (var i = 0; i < indices.length; i++) {
        points.push(vertices[indices[i]]);
        colors.push(faceColors[colorIndex]);
    }
}

function colorCube() {
    quad(1, 0, 3, 2, 0); quad(2, 3, 7, 6, 1);
    quad(3, 0, 4, 7, 2); quad(6, 5, 1, 2, 3);
    quad(4, 5, 6, 7, 4); quad(5, 4, 0, 1, 5);
}

function drawSolidCube(w, h, d, color) {
    var s = scale(w, h, d);
    var instanceMatrix = mult(modelViewMatrix, s);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    gl.disableVertexAttribArray(vColorLoc);
    gl.vertexAttrib4fv(vColorLoc, color);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
    gl.enableVertexAttribArray(vColorLoc);
}

// --- JOINT LIMITS (DEGREES) ---
const JOINT_LIMITS = {
    BASE:  { min: -180, max: 180 },
    LOWER: { min: -20,  max: 90  },   // cannot go below table
    UPPER: { min: 0,    max: 135 },
    WRIST: { min: 0,  max: 180  }
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getLimitState(value, min, max) {
    const threshold = 10; // degrees before limit
    if (value <= min || value >= max) return "limit";
    if (value <= min + threshold || value >= max - threshold) return "near";
    return "normal";
}

function updateSliderUI() {
    const sliders = [
        document.getElementById("slider1"),
        document.getElementById("slider2"),
        document.getElementById("slider3"),
        document.getElementById("slider4")
    ];

    const limits = [
        JOINT_LIMITS.BASE,
        JOINT_LIMITS.LOWER,
        JOINT_LIMITS.UPPER,
        JOINT_LIMITS.WRIST
    ];

    sliders.forEach((s, i) => {
        if (!s) return;
         
        s.value = theta[i];

        const state = getLimitState(theta[i], limits[i].min, limits[i].max);

        // Slider color feedback
        if (state === "limit") {
            s.style.background = "linear-gradient(to right, #dc3545, #dc3545)";
        } else if (state === "near") {
            s.style.background = "linear-gradient(to right, #ffc107, #ffc107)";
        } else {
            s.style.background = "linear-gradient(to right, #808080, #808080)";
        }

        s.classList.remove("range-normal", "range-near", "range-limit");

        if (state === "limit") s.classList.add("range-limit");
        else if (state === "near") s.classList.add("range-near");
        else s.classList.add("range-normal");

        // Debug Output
        console.log("Slider", i+1, "| state =", state, "| value =", theta[i]);
    });

    updateLabel("baseLabel", theta[BASE], JOINT_LIMITS.BASE);
    updateLabel("lowerLabel", theta[LOWER_ARM], JOINT_LIMITS.LOWER);
    updateLabel("upperLabel", theta[UPPER_ARM], JOINT_LIMITS.UPPER);
    updateLabel("wristLabel", theta[WRIST], JOINT_LIMITS.WRIST);
}

function updateLabel(id, value, limits) {
    const label = document.getElementById(id);
    if (!label) return;

    label.innerHTML = value + "°";

    const state = getLimitState(value, limits.min, limits.max);
    if (state === "limit") {
        label.style.color = "red";
        label.title = "Joint at mechanical limit";
    } else if (state === "near") {
        label.style.color = "orange";
        label.title = "Approaching joint limit";
    } else {
        label.style.color = "white";
        label.title = "";
    }
}

function performGrab() {
    var msg = document.getElementById("statusLabel");
    if(isObjectCaught) {
        isObjectCaught = false; 
        gripperGap = 0.2; 
        objectPosition = vec3(trueWristPosition[0], -1.4, trueWristPosition[2]);
        if(msg) {
            msg.style.color = "#28a745";
            msg.innerHTML = "Object Dropped";
        }
    } else {
        var dx = trueWristPosition[0] - objectPosition[0];
        var dy = trueWristPosition[1] - objectPosition[1];
        var dz = trueWristPosition[2] - objectPosition[2];
        var dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist < 3.8) { 
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
        document.getElementById(id).disabled = !enable;
    });
}   
    
function handleAutomation() {
    
    if (!isAutomating) {
        toggleManualControls(true);
        return;
    }

    // If during automation but somehow lost the object during a move step 
    // where we should have it (Steps 4, 5, 6), stop automation.
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
        theta[index] += (theta[index] < target) ? speed : -speed;

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
        case 1: // ALIGN BASE
            if(msg) {
                msg.style.color = "#2850a7ff";
                msg.innerHTML = "Auto: Aligning Base...";
            }
            if (moveToward(BASE, -180)) automationStep = 2;
            break;
        case 2: // REACH
            if(msg) {
                msg.style.color = "#2850a7ff";
                msg.innerHTML = "Auto: Reaching for Object...";
            }
            var lReached = moveToward(LOWER_ARM, 45);
            var uReached = moveToward(UPPER_ARM, 100); 
            if (lReached && uReached) automationStep = 3;
            break;
        case 3: // GRAB
            performGrab();
            if(isObjectCaught) {
                automationStep = 4;
            } else {
                isAutomating = false;
            }
            break;
        case 4: // LIFT
            if(msg) {
                msg.style.color = "#2850a7ff";
                msg.innerHTML = "Auto: Lifting...";
            }
            var lLifted = moveToward(LOWER_ARM, -10);
            var uLifted = moveToward(UPPER_ARM, 20);
            if (lLifted && uLifted) automationStep = 5;
            break;

        case 5: // ROTATE TO DROP ZONE
        if(msg) {
            msg.style.color = "#2850a7ff";
            msg.innerHTML = "Auto: Moving to Drop...";
        }
        if (moveToward(BASE, 5)) automationStep = 6;
        break;

    case 6: // POSITION FOR DROP
        if(msg) {
            msg.style.color = "#2850a7ff";
            msg.innerHTML = "Auto: Positioning for Drop...";
        }
        // Move joints to the specific placement height
        var lDropPos = moveToward(LOWER_ARM, 35);
        var uDropPos = moveToward(UPPER_ARM, 95);
        if (lDropPos && uDropPos) automationStep = 7; // Proceed to the actual drop
        break;

    case 7: // THE DROP SWITCH CASE
        if(msg) {
            msg.style.color = "#2850a7ff";
            msg.innerHTML = "Auto: Releasing Object...";
        }
        isObjectCaught = false; // Release the object
        gripperGap = 0.2; // Open the fingers
        
        // Finalize the object's new position on the table
        objectPosition = vec3(trueWristPosition[0], -1.75, trueWristPosition[2]); 
        
        // Finish automation
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
    gl.clearColor(0.95, 0.95, 0.95, 1.0);
    gl.enable(gl.DEPTH_TEST);

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    colorCube();

    var cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);
    vColorLoc = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColorLoc, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColorLoc);

    var vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);
    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    modelViewMatrixLoc = gl.getUniformLocation(program, "modelViewMatrix");
    var projectionMatrix = ortho(-15, 15, -10, 10, -50, 50);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(projectionMatrix));

    // UI Listeners
    document.getElementById("slider1").oninput = e => { 
        theta[BASE] = clamp(parseFloat(e.target.value),
                         JOINT_LIMITS.BASE.min,
                         JOINT_LIMITS.BASE.max);
        isAutomating = false;
        updateSliderUI();
        if (modeLabel) {
            modeLabel.style.color = "#6c757d";
            modeLabel.innerHTML = "Manual Control (Slider)";
        }
    };
    document.getElementById("slider2").oninput = e => { 
        theta[LOWER_ARM] = clamp(parseFloat(e.target.value),
                         JOINT_LIMITS.LOWER.min,
                         JOINT_LIMITS.LOWER.max); 
        isAutomating = false; 
        updateSliderUI();
        if (modeLabel) {
            modeLabel.style.color = "#6c757d";
            modeLabel.innerHTML = "Manual Control (Slider)";
        }
    };
    document.getElementById("slider3").oninput = e => { 
        theta[UPPER_ARM] = clamp(parseFloat(e.target.value),
                         JOINT_LIMITS.UPPER.min,
                         JOINT_LIMITS.UPPER.max); 
        isAutomating = false; 
        updateSliderUI();
        if (modeLabel) {
            modeLabel.style.color = "#6c757d";
            modeLabel.innerHTML = "Manual Control (Slider)";
        }
    };
    document.getElementById("slider4").oninput = e => { 
        theta[WRIST] = clamp(parseFloat(e.target.value),
                         JOINT_LIMITS.WRIST.min,
                         JOINT_LIMITS.WRIST.max);
        isAutomating = false; 
        updateSliderUI();
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
        // Only start from step 1 if not in the middle of a sequence
        if (automationStep === 0) automationStep = 1; 
    } else {
        // Make the button work as a Pause button too
        isAutomating = false;
        toggleManualControls(true);
    }
    };
    document.getElementById("autoResetBtn").onclick = function() {
    
    // 1. Force the automation to stop immediately
    isAutomating = false; 
    automationStep = 0; 
    toggleManualControls(true);

    // 2. Reset all joint angles to original starting position
    theta = [0, 30, 60, 90]; 

    // 3. Reset the object state
    isObjectCaught = false; 
    gripperGap = 0.2; // Open the fingers
    objectPosition = vec3(5.0, -1.4, 0.0); // Move cube back to start

    // 4. Update the UI Sliders so they match the reset angles
    updateSliderUI();

    // 5. Update the status label
    var msg = document.getElementById("statusLabel");
    if(msg) {
        msg.style.color = "#000";
        msg.innerHTML = "System Reset: Ready";
    }
    };
    
    const modeLabel = document.getElementById("statusLabel");

    // ================= KEYBOARD CONTROLS =================
    // Toggle Automation: Spacebar
    // Reset Automation: R
    // Base: A / D
    // Lower Arm: W / S
    // Upper Arm: I / K
    // Wrist: J / L
    // Grab/Release: Enter
    
    window.addEventListener("keydown", function(e) {    
        const key = e.key.toLowerCase();
        const modeLabel = document.getElementById("statusLabel");

        // 1. GLOBAL OVERRIDES (Always work, even during automation)
        if (key === 'r') { 
            document.getElementById("autoResetBtn").click(); 
            return; 
        }

        if (key === " ") { 
            // Prevent page from scrolling down when pressing space
            e.preventDefault(); 
            // Directly trigger the button logic to ensure they stay in sync
            document.getElementById("autoStartStopBtn").click();
            return;
        }

        // 2. GUARD CLAUSE (Block movement keys only during automation)
        if (isAutomating) return; 

        // 3. MOVEMENT CONTROLS
        const step = 3;
        let updated = false;
        if (modeLabel) {
            modeLabel.style.color = "#007bff";
            modeLabel.innerHTML = "Manual Control (Keyboard)";
        }

        
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
                theta[LOWER_ARM] = clamp(theta[LOWER_ARM] - step, JOINT_LIMITS.LOWER.min, JOINT_LIMITS.LOWER.max);
                updated = true;
                break;

            case 'i':
                theta[UPPER_ARM] = clamp(theta[UPPER_ARM] + step, JOINT_LIMITS.UPPER.min, JOINT_LIMITS.UPPER.max);
                updated = true;
                break;
            case 'k':
                theta[UPPER_ARM] = clamp(theta[UPPER_ARM] - step, JOINT_LIMITS.UPPER.min, JOINT_LIMITS.UPPER.max);
                updated = true;
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
            const msg = document.getElementById("statusLabel");
            if (msg) {
                msg.style.color = "#007bff";
                msg.innerHTML = "Manual Control (Keyboard)";
            }
        }
    });
    
    updateSliderUI();
    render();
};

function drawGripper(rootMatrix) {
    var rail = mult(rootMatrix, translate(0, 0.2, 0)); 
    modelViewMatrix = rail;
    drawSolidCube(2.4, 0.4, 0.4, vec4(0.2, 0.2, 0.2, 1.0)); 
    var leftFinger = mult(rootMatrix, translate(-0.6 - gripperGap, 1.1, 0)); 
    modelViewMatrix = leftFinger;
    drawSolidCube(0.3, 1.8, 0.8, vec4(1.0, 0.2, 0.6, 1.0)); 
    var rightFinger = mult(rootMatrix, translate(0.6 + gripperGap, 1.1, 0)); 
    modelViewMatrix = rightFinger;
    drawSolidCube(0.3, 1.8, 0.8, vec4(1.0, 0.2, 0.6, 1.0)); 
}

function drawFixedHinge(worldMatrix, radius, length, color) {
    var s = scale(radius * 2, length, radius * 2);
    var m = mult(worldMatrix, s);

    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(m));
    gl.disableVertexAttribArray(vColorLoc);
    gl.vertexAttrib4fv(vColorLoc, color);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
    gl.enableVertexAttribArray(vColorLoc);
}

function render() {
    handleAutomation();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    // 1. SET GLOBAL CAMERA VIEW
    viewMatrix = mult(rotateX(30), rotateY(25)); 

    // 2. DRAW THE TABLE
    modelViewMatrix = mult(viewMatrix, translate(0, -2.0, 0));
    drawSolidCube(20.0, 0.2, 12.0, vec4(0.3, 0.3, 0.3, 1)); 

    // --- ROBOT TRANSFORMATION HIERARCHY ---

    // 3. THE BASE (Yellow Block)
    // Position it on the floor level    
    var wRoot = translate(0, -1.9, 0); 
    wRoot = mult(wRoot, rotateY(theta[BASE]));
    
    // 4. LOWER ARM JOINT (Green)
    var wLowerPivot = mult(wRoot, translate(0, BASE_H, 0)); // Top of base
    
    // Draw Hinge at Pivot
    // Logic: View * Pivot * Small adjustment for center
    modelViewMatrix = mult(viewMatrix, wLowerPivot);
    drawFixedHinge(modelViewMatrix, 0.35, 0.6, vec4(0.2, 0.2, 0.2, 1));

    // Rotate arm around this pivot
    var wLower = mult(wLowerPivot, rotateZ(theta[LOWER_ARM]));
    
    // 5. UPPER ARM JOINT (Red)
    var wUpperPivot = mult(wLower, translate(0, LOWER_H, 0)); // Top of lower arm

    // Draw Hinge at Pivot
    modelViewMatrix = mult(viewMatrix, wUpperPivot);
    drawFixedHinge(modelViewMatrix, 0.3, 0.55, vec4(0.2, 0.2, 0.2, 1));

    // Rotate child link
    var wUpper = mult(wUpperPivot, rotateZ(theta[UPPER_ARM]));

    // 6. WRIST & GRIPPER
    var wGripper = mult(wUpper, translate(0, UPPER_H, 0));
    trueWristPosition = vec3(wGripper[0][3], wGripper[1][3], wGripper[2][3]);

    // --- DRAWING ACTUAL PARTS ---

    // Draw Yellow Base:
    modelViewMatrix = mult(viewMatrix, mult(wRoot, translate(0, 0.5, 0))); 
    drawSolidCube(5.0, 1.0, 2.0, vec4(1, 1, 0, 1)); 

    // Draw Green Lower Arm: 
    modelViewMatrix = mult(viewMatrix, mult(wLower, translate(0, 2.0, 0))); 
    drawSolidCube(1.0, 4.0, 1.0, vec4(0, 1, 0, 1)); 

    // Draw Red Upper Arm: 
    modelViewMatrix = mult(viewMatrix, mult(wUpper, translate(0, 1.75, 0))); 
    drawSolidCube(1.0, 3.5, 1.0, vec4(1, 0, 0, 1)); 

    // Draw Gripper
    var gripperFinalM = mult(viewMatrix, wGripper);
    gripperFinalM = mult(gripperFinalM, rotateY(theta[WRIST]));
    drawGripper(gripperFinalM);

    // 7. DRAW RED OBJECT
    if (isObjectCaught) {
        // Parented to Gripper
        modelViewMatrix = mult(gripperFinalM, translate(0, 1.4, 0));
        drawSolidCube(1.0, 1.0, 1.0, vec4(1, 0, 0, 1)); 
    } else {
        // Static on floor
        modelViewMatrix = mult(viewMatrix, translate(objectPosition[0], objectPosition[1], objectPosition[2]));
        drawSolidCube(1.0, 1.0, 1.0, vec4(1, 0, 0, 1)); 
    }

    requestAnimationFrame(render);
}
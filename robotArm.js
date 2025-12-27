"use strict";

var canvas, gl, program;

// --- JOINT VARIABLES ---
// [Updated] Added 4th value for Wrist Rotation
var theta = [0, 0, 15, 0]; 
var BASE = 0, LOWER_ARM = 1, UPPER_ARM = 2, WRIST = 3;

// --- DIMENSIONS ---
var BASE_H = 1.0, BASE_W = 5.0; 
var LOWER_H = 4.0, LOWER_W = 1.0;
var UPPER_H = 3.5, UPPER_W = 1.0;

// --- MATRICES ---
var modelViewMatrix;
var modelViewMatrixLoc, vColorLoc;
var viewMatrix; 

var points = [];
var colors = [];

// --- VARIABLES ---
var gripperGap = 0.2;         
var isObjectCaught = false;   
var objectPosition = vec3(5.0, -1.4, 0.0); 
var trueWristPosition = vec3(0, 0, 0); 

// Vertices & Colors (Standard)
var vertices = [
    vec3(-0.5, -0.5,  0.5), vec3(-0.5,  0.5,  0.5),
    vec3( 0.5,  0.5,  0.5), vec3( 0.5, -0.5,  0.5),
    vec3(-0.5, -0.5, -0.5), vec3(-0.5,  0.5, -0.5),
    vec3( 0.5,  0.5, -0.5), vec3( 0.5, -0.5, -0.5)
];

var faceColors = [
    vec4(1.0, 0.0, 0.0, 1.0), vec4(0.0, 1.0, 0.0, 1.0),
    vec4(0.0, 0.0, 1.0, 1.0), vec4(1.0, 1.0, 0.0, 1.0),
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

function drawRobotCube(w, h, d) {
    var s = scale(w, h, d);
    var instanceMatrix = mult(modelViewMatrix, s);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    gl.drawArrays(gl.TRIANGLES, 0, 36);
}

window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
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

    // Sliders
    document.getElementById("slider1").oninput = e => theta[BASE] = e.target.value;
    document.getElementById("slider2").oninput = e => theta[LOWER_ARM] = e.target.value;
    document.getElementById("slider3").oninput = e => theta[UPPER_ARM] = e.target.value;
    // [Updated] Wrist Slider
    document.getElementById("slider4").oninput = e => theta[WRIST] = e.target.value;

    // Button Logic
    var btn = document.getElementById("grabBtn");
    if(btn) {
        btn.onclick = function() {
            if(isObjectCaught) {
                // RELEASE
                isObjectCaught = false; 
                gripperGap = 0.2; 
                objectPosition = vec3(trueWristPosition[0], -1.4, trueWristPosition[2]);
                console.log("Object PLACED at: ", objectPosition);
            } else {
                // GRASP
                var dist = Math.sqrt(
                    Math.pow(trueWristPosition[0] - objectPosition[0], 2) +
                    Math.pow(trueWristPosition[2] - objectPosition[2], 2)
                );
                
                if (dist < 2.5) { 
                    isObjectCaught = true;
                    gripperGap = 0.0; 
                    console.log("Object PICKED!");
                } else {
                    alert("Missed! Distance: " + dist.toFixed(2) + ". Move closer.");
                }
            }
        };
    }

    render();
};

// --- GRIPPER DRAWING ---
function drawGripper(rootMatrix) {
    var railColor = vec4(0.2, 0.2, 0.2, 1.0);   // Dark Grey
    
    // [Updated] Pink Color for Fingers
    var fingerColor = vec4(1.0, 0.2, 0.6, 1.0); // Hot Pink

    // Wrist Rail
    var rail = mult(rootMatrix, translate(0, 0.2, 0)); 
    modelViewMatrix = rail;
    drawSolidCube(2.4, 0.4, 0.4, railColor); 

    // Left Finger
    var leftPos = -0.6 - gripperGap; 
    var leftFinger = mult(rootMatrix, translate(leftPos, 1.0, 0)); 
    modelViewMatrix = leftFinger;
    drawSolidCube(0.3, 1.6, 0.8, fingerColor); 

    // Right Finger
    var rightPos = 0.6 + gripperGap;
    var rightFinger = mult(rootMatrix, translate(rightPos, 1.0, 0)); 
    modelViewMatrix = rightFinger;
    drawSolidCube(0.3, 1.6, 0.8, fingerColor); 
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. CAMERA
    var rX = rotateX(30);
    var rY = rotateY(25);
    viewMatrix = mult(rX, rY); 

    // 2. SCENE
    var tableModelMatrix = mult(viewMatrix, translate(0, -2.0, 0));
    modelViewMatrix = tableModelMatrix;
    drawSolidCube(15.0, 0.2, 8.0, vec4(0, 0, 0, 1)); 

    var grey = vec4(0.8, 0.8, 0.8, 1.0);
    var legPositions = [
        translate(-7.0, -4.5,  3.5), translate( 7.0, -4.5,  3.5),
        translate(-7.0, -4.5, -3.5), translate( 7.0, -4.5, -3.5)
    ];
    for(var i=0; i<4; i++) {
        modelViewMatrix = mult(viewMatrix, legPositions[i]);
        drawSolidCube(0.4, 5.0, 0.4, grey);
    }

    // 3. ROBOT
    var robotXlate = translate(0, -1.9, 0); 
    var robotRoot = mult(viewMatrix, robotXlate);
    
    // Base
    robotRoot = mult(robotRoot, rotateY(theta[BASE]));
    modelViewMatrix = mult(robotRoot, translate(0, 0.5, 0));
    drawRobotCube(5.0, 1.0, 2.0);

    // Lower Arm
    var lowerArmRoot = mult(robotRoot, translate(0, 1.0, 0));
    lowerArmRoot = mult(lowerArmRoot, rotateZ(theta[LOWER_ARM]));
    modelViewMatrix = mult(lowerArmRoot, translate(0, 2.0, 0));
    drawRobotCube(1.0, 4.0, 1.0);

    // Upper Arm
    var upperArmRoot = mult(lowerArmRoot, translate(0, 4.0, 0));
    upperArmRoot = mult(upperArmRoot, rotateZ(theta[UPPER_ARM]));
    modelViewMatrix = mult(upperArmRoot, translate(0, 1.75, 0));
    drawRobotCube(1.0, 3.5, 1.0);

    // --- GRIPPER WITH ROTATION ---
    // Move to top of upper arm
    var gripperPos = mult(upperArmRoot, translate(0, 3.5, 0));
    // [Updated] Apply Wrist Rotation (RotateY spins the wrist)
    var gripperRoot = mult(gripperPos, rotateY(theta[WRIST]));
    
    drawGripper(gripperRoot);

    // --- LOGIC: SHADOW MATRIX ---
    // Re-calculate world position logic (ignoring rotation for distance check)
    var wRoot = translate(0, -1.9, 0);
    wRoot = mult(wRoot, rotateY(theta[BASE]));
    var wLower = mult(wRoot, translate(0, 1.0, 0));
    wLower = mult(wLower, rotateZ(theta[LOWER_ARM]));
    var wUpper = mult(wLower, translate(0, 4.0, 0));
    wUpper = mult(wUpper, rotateZ(theta[UPPER_ARM]));
    var wGripper = mult(wUpper, translate(0, 3.5, 0));
    
    if(wGripper[0].length === undefined) {
        trueWristPosition = vec3(wGripper[12], wGripper[13], wGripper[14]);
    } else {
        trueWristPosition = vec3(wGripper[0][3], wGripper[1][3], wGripper[2][3]);
    }

    // --- DRAW OBJECT ---
    if (isObjectCaught) {
        // [Updated] Picked Object follows Gripper Rotation
        var heldObject = mult(gripperRoot, translate(0, 1.0, 0)); 
        modelViewMatrix = heldObject;
        drawSolidCube(1.0, 1.0, 1.0, vec4(1, 0, 0, 1)); 
    } else {
        var freeObject = mult(viewMatrix, translate(objectPosition[0], objectPosition[1], objectPosition[2]));
        modelViewMatrix = freeObject;
        drawSolidCube(1.0, 1.0, 1.0, vec4(1, 0, 0, 1)); 
    }

    requestAnimationFrame(render);
}
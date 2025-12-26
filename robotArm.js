"use strict";

var canvas, gl, program;

var theta = [0, 0, 15];
var BASE = 0, LOWER_ARM = 1, UPPER_ARM = 2;

// Dimensions to match your reference image
var BASE_H = 1.0, BASE_W = 5.0; 
var LOWER_H = 4.0, LOWER_W = 1.0;
var UPPER_H = 3.5, UPPER_W = 1.0;

var TABLE_W = 15.0, TABLE_H = 0.2, TABLE_D = 8.0;
var LEG_H = 5.0, LEG_W = 0.3;

var modelViewMatrix;
var modelViewMatrixLoc, vColorLoc;

var points = [];
var colors = [];

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
    
    // Zoom out enough to see the legs (-12 to 12)
    var projectionMatrix = ortho(-15, 15, -10, 10, -50, 50);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(projectionMatrix));

    document.getElementById("slider1").oninput = e => theta[BASE] = e.target.value;
    document.getElementById("slider2").oninput = e => theta[LOWER_ARM] = e.target.value;
    document.getElementById("slider3").oninput = e => theta[UPPER_ARM] = e.target.value;

    render();
};

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. CAMERA VIEW (Top-down tilted view)
    var rX = rotateX(30);
    var rY = rotateY(25);
    var viewMatrix = mult(rX, rY); 

    // 2. DRAW TABLE (Black Top)
    // We create a specific matrix for the table
    var tableModelMatrix = mult(viewMatrix, translate(0, -2.0, 0));
    modelViewMatrix = tableModelMatrix;
    drawSolidCube(15.0, 0.2, 8.0, vec4(0, 0, 0, 1)); 

    // 3. DRAW LEGS (Grey)
    var lx = 7.0, lz = 3.5;
    var grey = vec4(0.8, 0.8, 0.8, 1.0);
    
    // Legs move relative to the viewMatrix
    var legPositions = [
        translate(-lx, -4.5,  lz),
        translate( lx, -4.5,  lz),
        translate(-lx, -4.5, -lz),
        translate( lx, -4.5, -lz)
    ];

    for(var i=0; i<4; i++) {
        modelViewMatrix = mult(viewMatrix, legPositions[i]);
        drawSolidCube(0.4, 5.0, 0.4, grey);
    }

    // 4. DRAW ROBOT (The Missing Part)
    // We move the robot root to be just ABOVE the table surface (y = -1.9)
    var robotXlate = translate(0, -1.9, 0); 
    var robotRoot = mult(viewMatrix, robotXlate);
    
    // Apply Base Rotation (Slider 1)
    robotRoot = mult(robotRoot, rotateY(theta[BASE]));

    // --- BASE CUBE ---
    // Offset the cube upward by half its height (0.5) so its bottom touches the table
    modelViewMatrix = mult(robotRoot, translate(0, 0.5, 0));
    drawRobotCube(5.0, 1.0, 2.0);

    // --- LOWER ARM ---
    // Start from top of base (y = 1.0)
    var lowerArmRoot = mult(robotRoot, translate(0, 1.0, 0));
    lowerArmRoot = mult(lowerArmRoot, rotateZ(theta[LOWER_ARM]));
    
    // Move up by half height (2.0) to draw
    modelViewMatrix = mult(lowerArmRoot, translate(0, 2.0, 0));
    drawRobotCube(1.0, 4.0, 1.0);

    // --- UPPER ARM ---
    // Start from top of lower arm (y = 4.0)
    var upperArmRoot = mult(lowerArmRoot, translate(0, 4.0, 0));
    upperArmRoot = mult(upperArmRoot, rotateZ(theta[UPPER_ARM]));
    
    // Move up by half height (1.75) to draw
    modelViewMatrix = mult(upperArmRoot, translate(0, 1.75, 0));
    drawRobotCube(1.0, 3.5, 1.0);

    requestAnimationFrame(render);
}
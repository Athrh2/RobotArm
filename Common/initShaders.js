function initShaders(gl, vertexShaderId, fragmentShaderId) {
    var vertElem = document.getElementById(vertexShaderId);
    var fragElem = document.getElementById(fragmentShaderId);

    if (!vertElem || !fragElem) {
        console.error("Shader script not found:", vertexShaderId, fragmentShaderId);
        return null;
    }

    var vertShdr = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertShdr, vertElem.textContent);
    gl.compileShader(vertShdr);
    if (!gl.getShaderParameter(vertShdr, gl.COMPILE_STATUS)) {
        console.error("Vertex shader compile error:", gl.getShaderInfoLog(vertShdr));
        return null;
    }

    var fragShdr = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragShdr, fragElem.textContent);
    gl.compileShader(fragShdr);
    if (!gl.getShaderParameter(fragShdr, gl.COMPILE_STATUS)) {
        console.error("Fragment shader compile error:", gl.getShaderInfoLog(fragShdr));
        return null;
    }

    var program = gl.createProgram();
    gl.attachShader(program, vertShdr);
    gl.attachShader(program, fragShdr);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Shader program link error:", gl.getProgramInfoLog(program));
        return null;
    }

    return program;
}

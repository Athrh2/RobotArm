📘 Academic Context

This project is developed as part of an academic assignment on CPC354 Interactive Computer Graphics, focusing on:
- Hierarchical modeling
- Articulated animation
- Human–computer interaction
- Digital twin simulation concepts


🎯 Automated Pick-and-Place Animation
- State-machine-based automation sequence:
1. Base alignment
2. Reach object
3. Grasp object
4. Lift object
5. Move to target location
6. Release object
- Start, stop, and reset controls
- Safe interruption and failure handling


🎮 Keyboard Controls
| Action                 | Control  |
| ---------------------- | -------- |
| Rotate Base            | A / D    |
| Move Lower Arm         | W / S    |
| Move Upper Arm         | I / K    |
| Rotate Wrist           | J / L    |
| Grab/Release Object    | Enter    |
| Start/Pause Automation | Spacebar |
| Reset System           | R        |


🚀 How to Run
1. Clone or download this repository
2. Open robotArm.html using a local web server (recommended)
Example:
python -m http.server
3. Open your browser and navigate to: http://localhost:8000
4. Interact with the robotic arm using sliders, keyboard, or automation controls

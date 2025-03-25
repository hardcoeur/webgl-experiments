import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

class Renderer {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.scene = new THREE.Scene();
        this.model = null;
        this.pivot = null;
        this.rotationSpeed = 0;
        this.targetRotation = 0;
        this.setupScreenHeight();
        this.setupCamera();
        this.setupRenderer();
        this.setupPostProcessing();
        this.setupLights();
        this.loadModel();
        
        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    setupScreenHeight() {
        const screenHeight = window.screen.height;
        this.container.style.height = `${screenHeight}px`;
        this.screenHeight = screenHeight;
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            18,
            window.innerWidth / this.screenHeight,
            0.1,
            1000
        );
        this.camera.position.set(2, 0, 0);
        this.camera.lookAt(0, 0, 0);
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(window.innerWidth, this.screenHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.9;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.container.appendChild(this.renderer.domElement);
    }

    setupPostProcessing() {
        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        const grayscaleShader = {
            uniforms: {
                "tDiffuse": { value: null }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                varying vec2 vUv;
                void main() {
                    vec4 color = texture2D(tDiffuse, vUv);
                    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                    gl_FragColor = vec4(vec3(gray), color.a);
                }
            `
        };

        const grayscalePass = new ShaderPass(grayscaleShader);
        this.composer.addPass(grayscalePass);
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
        mainLight.position.set(5, 5, 5);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        this.scene.add(mainLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
        fillLight.position.set(-5, -2, -5);
        this.scene.add(fillLight);
    }

    vectorToString(v) {
        return `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`;
    }

    updateRotation() {
        if (!this.pivot) return;

        // Check if we need a new target rotation
        if (Math.abs(this.pivot.rotation.z - this.targetRotation) < 0.001) {
            // Generate new random angle between 3 and 16 degrees
            const newAngle = (Math.random() * 13 + 3) * Math.PI / 180;
            // Randomly choose direction
            this.targetRotation = this.pivot.rotation.z + (Math.random() > 0.5 ? newAngle : -newAngle);
        }

        // Smoothly interpolate to target rotation
        const rotationSpeed = 0.0015;
        this.pivot.rotation.z += (this.targetRotation - this.pivot.rotation.z) * rotationSpeed;
    }

    loadModel() {
        console.log('Starting model load...');
        const mtlLoader = new MTLLoader();
        const basePath = './static/sceneone/';
        
        mtlLoader.load(
            basePath + 'obj.mtl',
            (materials) => {
                console.log('MTL loaded successfully');
                materials.preload();

                const objLoader = new OBJLoader();
                objLoader.setMaterials(materials);

                objLoader.load(
                    basePath + 'obj.obj',
                    (object) => {
                        console.log('OBJ loaded successfully');
                        
                        // Get original size and center
                        const box = new THREE.Box3().setFromObject(object);
                        const size = box.getSize(new THREE.Vector3());
                        const center = box.getCenter(new THREE.Vector3());
                        
                        console.log('Original size:', this.vectorToString(size));
                        console.log('Original center:', this.vectorToString(center));

                        // Calculate viewport height at camera distance
                        const vFOV = this.camera.fov * Math.PI / 180;
                        const viewportHeight = 2 * Math.tan(vFOV / 2) * this.camera.position.length();
                        const targetSize = viewportHeight * 3.2; // Fill 320% of viewport height

                        // Scale to fit viewport
                        const maxDim = Math.max(size.x, size.y, size.z);
                        const scale = targetSize / maxDim;
                        object.scale.setScalar(scale);

                        // Reset position and rotation
                        object.position.set(0, 0, 0);
                        object.rotation.set(0, 0, 0);

                        // First rotate to lay flat
                        object.rotation.x = -Math.PI / 2;
                        object.rotation.y = Math.PI / 2;

                        // Get new bounds after initial transformations
                        const rotatedBox = new THREE.Box3().setFromObject(object);
                        const rotatedCenter = rotatedBox.getCenter(new THREE.Vector3());
                        const rotatedSize = rotatedBox.getSize(new THREE.Vector3());

                        // Calculate 40% of viewport height for downward shift
                        const viewportShift = viewportHeight * 0.4;

                        // Create pivot at model's center
                        this.pivot = new THREE.Group();
                        this.pivot.position.set(
                            -rotatedCenter.x,
                            rotatedSize.y / 2 - viewportShift,
                            -rotatedCenter.z
                        );

                        // Add pivot to scene
                        this.scene.add(this.pivot);

                        // Add model to pivot
                        this.pivot.add(object);

                        // Store reference to model
                        this.model = object;

                        // Log final dimensions
                        const finalBox = new THREE.Box3().setFromObject(object);
                        const finalSize = finalBox.getSize(new THREE.Vector3());
                        console.log('Final size:', this.vectorToString(finalSize));

                        // Start animation
                        if (!this.isAnimating) {
                            this.isAnimating = true;
                            this.animate();
                        }
                    },
                    (xhr) => {
                        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
                    },
                    (error) => {
                        console.error('Error loading OBJ:', error);
                    }
                );
            },
            (xhr) => {
                console.log((xhr.loaded / xhr.total * 100) + '% loaded');
            },
            (error) => {
                console.error('Error loading MTL:', error);
            }
        );
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / this.screenHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, this.screenHeight);
        this.composer.setSize(window.innerWidth, this.screenHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.updateRotation();
        this.composer.render();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Renderer();
});
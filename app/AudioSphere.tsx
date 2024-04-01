import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface AudioSphereProps {
  color?: string;
  size?: number;
  audioStream?: MediaStream;
}

const AudioSphere: React.FC<AudioSphereProps> = ({ color = 0xff0000, size = 1, audioStream }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null); // Using Uint8Array for frequency data

  useEffect(() => {
    if (!window.AudioContext) {
      console.error('AudioContext is not supported in this browser');
      return;
    }

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const analyser = audioContext.createAnalyser();
    analyserRef.current = analyser;
    analyser.fftSize = 256;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

    if (audioStream) {
      const source = audioContext.createMediaStreamSource(audioStream);
      source.connect(analyser);
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ alpha: true }); // Ensure the renderer supports transparency
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0xffffff, 1); // Set the background color to white
    mountRef.current?.appendChild(renderer.domElement);

    const geometry = new THREE.SphereGeometry(size, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color, wireframe: true });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    camera.position.z = 5;

    const animate = () => {
      requestAnimationFrame(animate);

      // Diagonal rotation
      sphere.rotation.x += 0.01;
      sphere.rotation.y += 0.01;

      if (analyserRef.current && dataArrayRef.current) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);

        const positions = geometry.attributes.position;
        const vertex = new THREE.Vector3();

        for (let i = 0; i < positions.count; i++) {
          vertex.fromBufferAttribute(positions, i);

          const offset = dataArrayRef.current[i % dataArrayRef.current.length] / 128;
          const magnitude = 1 + offset * 0.3; // Adjust vertex displacement scale

          vertex.normalize().multiplyScalar(magnitude);
          positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }

        positions.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      mountRef.current?.removeChild(renderer.domElement);
      audioContextRef.current?.close();
    };
  }, [color, size, audioStream]);

  return <div ref={mountRef}></div>;
};

export default AudioSphere;

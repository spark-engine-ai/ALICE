'use client'
import Image from "next/image";
import Microphone from "./microphone";
import { FaGithub } from "react-icons/fa";
import { CiLinkedin } from "react-icons/ci";
import Siriwave from 'react-siriwave';


export default async function Home() {
  return (
    <main className="flex flex-col items-center justify-between" >
      <div className="mb-12 flex justify-center items-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-4">
        <Microphone />
      </div>
    </main>
  );
}

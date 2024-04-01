"use client";

import {
  CreateProjectKeyResponse,
  LiveClient,
  LiveTranscriptionEvents,
  createClient,
} from "@deepgram/sdk";
import { useState, useEffect, useCallback, use } from "react";
import { useQueue } from "@uidotdev/usehooks";
import config from '../spark.config'
import Image from "next/image";
import axios from "axios";
import Siriwave from 'react-siriwave';
import AudioSphere from './AudioSphere';
import ChatGroq from "groq-sdk";

let conversationHistory = [
  { role: "assistant", content: `${config.groq?.content}` }
];

export default function Microphone() {
  const { add, remove, first, size, queue } = useQueue<any>([]);
  const [apiKey, setApiKey] = useState<CreateProjectKeyResponse | null>();
  const [neetsApiKey, setNeetsApiKey] = useState<string | null>();
  const [groqClient, setGroqClient] = useState<ChatGroq>();
  const [connection, setConnection] = useState<LiveClient | null>();
  const [isListening, setListening] = useState(false);
  const [isLoadingKey, setLoadingKey] = useState(true);
  const [isLoading, setLoading] = useState(true);
  const [isProcessing, setProcessing] = useState(false);
  const [micOpen, setMicOpen] = useState(false);
  const [microphone, setMicrophone] = useState<MediaRecorder | null>();
  const [userMedia, setUserMedia] = useState<MediaStream | null>();
  const [aiStream, setAiStream] = useState<MediaStream | null>();
  const [caption, setCaption] = useState<string | null>();
  const [audio, setAudio] = useState<HTMLAudioElement | null>();
  const [audioStarted, setAudioStarted] = useState(false);

  const startMicrophone = async () => {
    try {
      microphone?.stop();
      userMedia?.getTracks().forEach(track => track.stop());

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const micRecorder = new MediaRecorder(stream);

      micRecorder.ondataavailable = (e) => add(e.data);
      micRecorder.start(500);

      setUserMedia(stream);
      setMicrophone(micRecorder);
      setMicOpen(true);

    } catch (error) {
      console.error("Microphone initialization failed:", error);
    }
  };

  useEffect(() => {

    startMicrophone();

    return () => {
      microphone?.stop();
      userMedia?.getTracks().forEach(track => track.stop());
      setMicOpen(false);
    };
  }, []);


  useEffect(() => {
    if (!groqClient) {
      console.log("getting a new groqClient");
      fetch("/api/groq", { cache: "no-store" })
        .then((res) => res.json())
        .then((object) => {
          const groq = new ChatGroq({ apiKey: object.apiKey, dangerouslyAllowBrowser: true});

          setGroqClient(groq);
          setLoadingKey(false);
        })
        .catch((e) => {
          console.error(e);
        });

    }
  }, [groqClient]);

  useEffect(() => {
    if (!neetsApiKey) {
      console.log("getting a new neets api key");
      fetch("/api/neets", { cache: "no-store" })
        .then((res) => res.json())
        .then((object) => {
          if (!("apiKey" in object)) throw new Error("No api key returned");

          setNeetsApiKey(object.apiKey);
          setLoadingKey(false);
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }, [neetsApiKey]);

  useEffect(() => {
    if (!apiKey) {
      console.log("getting a new api key");
      fetch("/api", { cache: "no-store" })
        .then((res) => res.json())
        .then((object) => {
          if (!("key" in object)) throw new Error("No api key returned");

          setApiKey(object);
          setLoadingKey(false);
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }, [apiKey]);

  let isAudioPlaying = false;

  useEffect(() => {
    if (apiKey && "key" in apiKey) {
      console.log("connecting to deepgram");
      const deepgram = createClient(apiKey?.key ?? "");
      const connection = deepgram.listen.live({
        model: config.deepgram?.model || "nova",
        interim_results: false,
        language: "en-US",
        smart_format: true,
      });

      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log("connection established");
        setListening(true);
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log("connection closed");
        setListening(false);
        setApiKey(null);
        setConnection(null);
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const words = data.channel.alternatives[0].words;
        const caption = words
          .map((word: any) => word.punctuated_word ?? word.word)
          .join(" ");
        if (caption !== "" && !isAudioPlaying) {
                  isAudioPlaying = true;
          setCaption(caption);
          if (data.is_final) {
              conversationHistory = [
                ...conversationHistory,
                { role: "user", content: caption }
              ].slice(-7);

              if (groqClient) {
                const completion = groqClient.chat.completions.create({
                  messages: conversationHistory,
                  model: config.groq?.model || 'mixtral-8x7b-32768',
                })
                .then((chatCompletion) => {
                  const newAIResponse = { role: "assistant", content: chatCompletion.choices[0]?.message?.content || "" };
                  conversationHistory = [...conversationHistory, newAIResponse].slice(-7);

                  if (neetsApiKey) {
                    setCaption(chatCompletion.choices[0]?.message?.content || "");
                    axios.post("https://api.neets.ai/v1/tts", {
                      text: chatCompletion.choices[0]?.message?.content || "",
                      voice_id: config.voice.voiceId || "us-female-13",
                      params: {
                        model: config.voice.model || "ar-diff-50k"
                      }
                    },
                    {
                      headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': neetsApiKey
                      },
                      responseType: 'arraybuffer'
                    }
                  ).then((response) => {
                    const blob = new Blob([response.data], { type: 'audio/mp3' });
                    const url = URL.createObjectURL(blob);
                    const newAudioElement = new Audio(url);

                    setAudio(newAudioElement);

                    newAudioElement.play().then(() => {
                      console.log('Audio playback started.');
                      if ('captureStream' in newAudioElement) {
                        const stream = (newAudioElement as any).captureStream();
                        setAiStream(stream);
                      }
                      newAudioElement.onended = () => {
                        console.log('Audio playback ended.');
                        isAudioPlaying = false;
                      };
                    }).catch((error) => {
                      console.error("Error during audio playback:", error);
                    });
                  })
                }
              });

            }
          }
        }
      });

      setConnection(connection);
      setLoading(false);
    }
  }, [apiKey, isAudioPlaying]);


  useEffect(() => {
    const processQueue = async () => {
      if (size > 0 && !isProcessing && isListening && connection) {
        setProcessing(true);

        const blob = first;
        connection.send(blob);
        remove();

        const waiting = setTimeout(() => {
          clearTimeout(waiting);
          setProcessing(false);
        }, 250);
      }
    };

    processQueue();
  }, [connection, queue, remove, first, size, isProcessing, isListening]);


  function handleAudio() {
      isAudioPlaying = true;
      return audio && audio.currentTime > 0 && !audio.paused && !audio.ended && audio.readyState > 2;
  }

  if (isLoadingKey)
    return (
      <span className="w-full text-center">Loading Spark Engine...</span>
    );
  if (isLoading)
    return <span className="w-full text-center">Loading voice modules...</span>;

  return (
    <div className="w-full relative">
      <div className="relative flex w-screen flex justify-center items-center max-w-screen-lg place-items-center content-center before:pointer-events-none after:pointer-events-none before:absolute before:right-0 after:right-1/4 before:h-[300px] before:w-[480px] before:-translate-x-1/2 before:rounded-full">
      <AudioSphere
        color="skyblue"
        size={2}
        audioStream={aiStream ?? userMedia ?? undefined}
      />
      </div>

    </div>
  );
}

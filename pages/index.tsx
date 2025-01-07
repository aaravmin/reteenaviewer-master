

import * as nif from "nifti-reader-js";
import { upload } from "@vercel/blob/client";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";


export default function Home() {
  const [file, setFile] = useState(null as ArrayBuffer | null);
  const [sliceIndex, setSliceIndex] = useState(0); // track the current slice
  const [sliceIndey, setSliceIndey] = useState(0);
  const [sliceIndez, setSliceIndez] = useState(0);
  const [points, setPoints] = useState([] as number[][]);

  useEffect(() => {
    document.querySelectorAll("canvas").forEach((canvas) => {
      if (canvas.hasAttribute("data-engine")) {
        canvas.remove();
      }
    });

    if (points.length > 0) {
      let posPoints = points.map((point) => {
        return [point[0] - 125, point[1] - 125, point[2] - 125];
      });
      let colors = points.map((point) => {
        return [point[3] / 255, point[3] / 255, point[3] / 255];
      });

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      const renderer = new THREE.WebGLRenderer();
      renderer.setSize(window.innerWidth, window.innerHeight);
      document.body.appendChild(renderer.domElement);

      const geometry = new THREE.BufferGeometry();
      const vertices = new Float32Array(posPoints.flat());
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      const colorsArray = new Float32Array(colors.flat());
      geometry.setAttribute("color", new THREE.BufferAttribute(colorsArray, 3));

      const material = new THREE.PointsMaterial({
        size: 2,
        vertexColors: true,
        opacity: 230,
      });

      // set background color
      renderer.setClearColor(0xffffff, 1);

      const pointss = new THREE.Points(geometry, material);
      scene.add(pointss);

      camera.position.z = 255;
      camera.position.y = 255;
      camera.position.x = 255;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.update();

      const animate = function () {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
      };
      animate();
    }
  }, [points]);

  useEffect(() => {
    if (file) {
      DisplayResults(file);
    }
  }, [file]);

  function UpdatePointArray(
    niftiHeader: nif.NIFTI1 | nif.NIFTI2,
    niftiImage: ArrayBuffer
  ) {
    console.log("Updating point array");
    const cols = niftiHeader.dims[1];
    const rows = niftiHeader.dims[2];
    const slices = niftiHeader.dims[3];
    const dataView = new DataView(niftiImage);
    let points: number[][] = [];

    for (let slice = 0; slice < slices; slice++) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const pixelIndex = slice * cols * rows + row * cols + col;
          let pixelValue: number;
          if (niftiHeader.datatypeCode === nif.NIFTI1.TYPE_UINT16) {
            pixelValue = dataView.getUint16(pixelIndex * 2, true);
          } else if (niftiHeader.datatypeCode === nif.NIFTI1.TYPE_FLOAT32) {
            pixelValue = dataView.getFloat32(pixelIndex * 4, true);
          } else if (niftiHeader.datatypeCode === nif.NIFTI1.TYPE_UINT8) {
            pixelValue = dataView.getUint8(pixelIndex);
          } else {
            pixelValue = 0;
            console.warn(
              "Unsupported NIFTI data type: ",
              niftiHeader.datatypeCode
            );
          }

          let normalizedValue = pixelValue;
          const maxRange = 400;
          // if the pixel values are in [0, 1], use them directly
          if (pixelValue <= 1) {
            normalizedValue = pixelValue * 255;
          } else {
            // otherwise clamp/normalize
            normalizedValue = Math.min(
              Math.max((pixelValue / maxRange) * 255, 0),
              255
            );
          }

          if (pixelValue > 0) {
            points.push([col, row, slice, normalizedValue]);
          }
        }
      }
    }
    console.log("Points:", points);
    setPoints(points);
  }

  function DisplayResults(file: ArrayBuffer) {
    try {
      console.log("Processing file...");
      if (nif.isCompressed(file)) {
        file = nif.decompress(file) as ArrayBuffer;
        console.log("File decompressed successfully.");
      }

      if (nif.isNIFTI(file)) {
        const niftiHeader = nif.readHeader(file);
        console.log("NIFTI Header:", niftiHeader);
        if (niftiHeader == null) {
          console.error("NIFTI header is null.");
          alert("Invalid NIFTI file. Please upload a valid file.");
          return;
        }

        const niftiImage = nif.readImage(niftiHeader, file);
        const slices = niftiHeader.dims[3];
        const cols = niftiHeader.dims[1];
        const rows = niftiHeader.dims[2];

        UpdatePointArray(niftiHeader, niftiImage);

        // set up x‐slider
        const layer = document.getElementById("layer") as HTMLInputElement;
        if (layer) {
          layer.max = (slices - 1).toString();
          layer.value = "0";
          layer.oninput = function () {
            const slice = parseInt(layer.value);
            setSliceIndex(slice); // update slice index on slider
            Draw(slice, niftiHeader, niftiImage);
          };
        }

        // set up y‐slider
        const layery = document.getElementById("layery") as HTMLInputElement;
        if (layery) {
          layery.max = (cols - 1).toString();
          layery.value = "0";
          layery.oninput = function () {
            const slice = parseInt(layery.value);
            setSliceIndey(slice);
            DrawY(slice, niftiHeader, niftiImage);
          };
        }

        // set up z‐slider
        const layerz = document.getElementById("layerz") as HTMLInputElement;
        if (layerz) {
          layerz.max = (rows - 1).toString();
          layerz.value = "0";
          layerz.oninput = function () {
            const slice = parseInt(layerz.value);
            setSliceIndez(slice);
            DrawZ(slice, niftiHeader, niftiImage);
          };
        }

        // draw initial slice
        Draw(0, niftiHeader, niftiImage);
      } else {
        console.error("The uploaded file is not a valid NIFTI file.");
        alert("The uploaded file is not a valid NIFTI file.");
      }
    } catch (error) {
      console.error("Error processing the NIFTI file:", error);
      alert("Error processing the file. Check console for details.");
    }
  }

  function DrawZ(
    row: number,
    header: nif.NIFTI1 | nif.NIFTI2,
    image: ArrayBuffer
  ) {
    const canvas = document.getElementById("resultz") as HTMLCanvasElement;
    if (!canvas) {
      console.error("Canvas element not found.");
      return;
    }

    const cols = header.dims[1];
    const rows = header.dims[2];
    const slices = header.dims[3];
    canvas.width = rows;
    canvas.height = slices;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("Failed to get canvas context.");
      return;
    }

    const imageData = ctx.createImageData(rows, slices);
    const dataView = new DataView(image);

    const maxRange = 400;

    for (let slice = 0; slice < slices; slice++) {
      for (let col = 0; col < cols; col++) {
        const pixelIndex = slice * cols * rows + row * cols + col;
        let pixelValue: number;

        if (header.datatypeCode === nif.NIFTI1.TYPE_UINT16) {
          pixelValue = dataView.getUint16(pixelIndex * 2, true);
        } else if (header.datatypeCode === nif.NIFTI1.TYPE_FLOAT32) {
          pixelValue = dataView.getFloat32(pixelIndex * 4, true);
        } else if (header.datatypeCode === nif.NIFTI1.TYPE_UINT8) {
          pixelValue = dataView.getUint8(pixelIndex);
        } else {
          pixelValue = 0;
          console.warn("Unsupported datatype:", header.datatypeCode);
        }

        let normalizedValue = pixelValue;

        if (pixelValue <= 1) {
          normalizedValue = pixelValue * 255;
        } else {
          normalizedValue = Math.min(
            Math.max((pixelValue / maxRange) * 255, 0),
            255
          );
        }

        const index = (col * slices + slice) * 4;
        imageData.data[index] = normalizedValue;
        imageData.data[index + 1] = normalizedValue;
        imageData.data[index + 2] = normalizedValue;
        imageData.data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function DrawY(
    col: number,
    header: nif.NIFTI1 | nif.NIFTI2,
    image: ArrayBuffer
  ) {
    const canvas = document.getElementById("resulty") as HTMLCanvasElement;
    if (!canvas) {
      console.error("Canvas element not found.");
      return;
    }

    const cols = header.dims[1];
    const rows = header.dims[2];
    const slices = header.dims[3];
    canvas.width = rows;
    canvas.height = slices;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("Failed to get canvas context.");
      return;
    }

    const imageData = ctx.createImageData(rows, slices);
    const dataView = new DataView(image);

    const maxRange = 400;

    for (let slice = 0; slice < slices; slice++) {
      for (let row = 0; row < rows; row++) {
        const pixelIndex = slice * cols * rows + row * cols + col;
        let pixelValue: number;

        if (header.datatypeCode === nif.NIFTI1.TYPE_UINT16) {
          pixelValue = dataView.getUint16(pixelIndex * 2, true);
        } else if (header.datatypeCode === nif.NIFTI1.TYPE_FLOAT32) {
          pixelValue = dataView.getFloat32(pixelIndex * 4, true);
        } else if (header.datatypeCode === nif.NIFTI1.TYPE_UINT8) {
          pixelValue = dataView.getUint8(pixelIndex);
        } else {
          pixelValue = 0;
          console.warn("Unsupported datatype:", header.datatypeCode);
        }

        let normalizedValue = pixelValue;
        if (pixelValue <= 1) {
          normalizedValue = pixelValue * 255;
        } else {
          normalizedValue = Math.min(
            Math.max((pixelValue / maxRange) * 255, 0),
            255
          );
        }

        const index = (row * slices + slice) * 4;
        imageData.data[index] = normalizedValue;
        imageData.data[index + 1] = normalizedValue;
        imageData.data[index + 2] = normalizedValue;
        imageData.data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function Draw(
    slice: number,
    header: nif.NIFTI1 | nif.NIFTI2,
    image: ArrayBuffer
  ) {
    const canvas = document.getElementById("result") as HTMLCanvasElement;
    if (!canvas) {
      console.error("Canvas element not found.");
      return;
    }

    const cols = header.dims[1];
    const rows = header.dims[2];
    canvas.width = cols;
    canvas.height = rows;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("Failed to get canvas context.");
      return;
    }

    const imageData = ctx.createImageData(cols, rows);
    const sliceOffset = slice * cols * rows;
    const dataView = new DataView(image);
    const maxRange = 400;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const pixelIndex = sliceOffset + row * cols + col;
        let pixelValue: number;

        if (header.datatypeCode === nif.NIFTI1.TYPE_UINT16) {
          pixelValue = dataView.getUint16(pixelIndex * 2, true);
        } else if (header.datatypeCode === nif.NIFTI1.TYPE_FLOAT32) {
          pixelValue = dataView.getFloat32(pixelIndex * 4, true);
        } else if (header.datatypeCode === nif.NIFTI1.TYPE_UINT8) {
          pixelValue = dataView.getUint8(pixelIndex);
        } else {
          pixelValue = 0;
          console.warn("Unsupported datatype:", header.datatypeCode);
        }

        let normalizedValue = pixelValue;
        if (pixelValue <= 1) {
          normalizedValue = pixelValue * 255;
        } else {
          normalizedValue = Math.min(
            Math.max((pixelValue / maxRange) * 255, 0),
            255
          );
        }

        const index = (row * cols + col) * 4;
        imageData.data[index] = normalizedValue;
        imageData.data[index + 1] = normalizedValue;
        imageData.data[index + 2] = normalizedValue;
        imageData.data[index + 3] = 255;
      }
    }

    console.log("Drawing slice:", slice);
    ctx.putImageData(imageData, 0, 0);
  }

  return (
    <div className="flex flex-col items-center justify-start w-full min-h-screen bg-gray-50">
      {/* Main container */}
      <div className="flex flex-row w-full h-full">
        {/* Left side panel */}
        <div className="min-w-[250px] max-w-[300px] p-4 bg-white border-r-2 border-gray-300 flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-2">Input NIFTI file</h2>
            <input
              type="file"
              onChange={async (e) => {
                try {
                  if (e.target.files && e.target.files[0]) {
                    const file = await e.target.files[0].arrayBuffer();
                    setFile(file);
                  } else {
                    console.error("No file selected.");
                    alert("Please select a valid file.");
                  }
                } catch (error) {
                  console.error("Error reading file:", error);
                  alert(
                    "An error occurred while reading the file. Please try again."
                  );
                }
              }}
            />
          </div>

          <div className="flex flex-col items-start text-xl w-full">
            <label className="font-medium">x</label>
            <input
              type="range"
              id="layer"
              className="w-full mt-1 mb-2 accent-blue-500"
            />
            <p className="text-sm">
              Current Slice: <span className="font-semibold">{sliceIndex + 1}</span>
            </p>
          </div>

          <div className="flex flex-col items-start text-xl w-full">
            <label className="font-medium">y</label>
            <input
              type="range"
              id="layery"
              className="w-full mt-1 mb-2 accent-green-500"
            />
            <p className="text-sm">
              Current Slice: <span className="font-semibold">{sliceIndey + 1}</span>
            </p>
          </div>

          <div className="flex flex-col items-start text-xl w-full">
            <label className="font-medium">z</label>
            <input
              type="range"
              id="layerz"
              className="w-full mt-1 mb-2 accent-red-500"
            />
            <p className="text-sm">
              Current Slice: <span className="font-semibold">{sliceIndez + 1}</span>
            </p>
          </div>

          <button
            className="px-4 py-2 rounded-md bg-gray-500 text-white hover:bg-gray-600"
            onClick={async () => {
              try {
                if (!file) {
                  window.alert("No file uploaded.");
                  return;
                }
                const response = await upload("scans", file as ArrayBuffer, {
                  access: "public",
                  handleUploadUrl: "/api/upload",
                });
                const r = await fetch("/api/runTransform", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    location: response.url,
                  }),
                });
                const responseJson = await r.json();
                setFile(await (await fetch(responseJson.url)).arrayBuffer());
              } catch (error) {
                console.error("Error running the model:", error);
                alert(
                  "Error running the model. Please check the console for details."
                );
              }
            }}
          >
            Run model on scan
          </button>
        </div>

        {/* Right side (canvases) */}
        <div className="flex flex-col w-full p-4 gap-4">
          {/* Primary (X) slice canvas */}
          <div className="w-full flex-grow border-2 border-gray-300 bg-white rounded-md flex items-center justify-center">
            <canvas id="result" className="max-w-full max-h-full" />
          </div>

          {/* Two smaller (Y/Z) slice canvases in a row */}
          <div className="flex flex-row gap-4 w-full h-[50%]">
            <div className="w-1/2 border-2 border-gray-300 bg-white rounded-md flex items-center justify-center">
              <canvas id="resulty" className="max-w-full max-h-full rotate-180" />
            </div>

            <div className="w-1/2 border-2 border-gray-300 bg-white rounded-md flex items-center justify-center">
              <canvas id="resultz" className="max-w-full max-h-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


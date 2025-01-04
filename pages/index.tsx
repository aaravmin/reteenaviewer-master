import * as nif from "nifti-reader-js";
import { upload } from "@vercel/blob/client";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export default function Home() {
  const [file, setFile] = useState(null as ArrayBuffer | null);
  const [sliceIndex, setSliceIndex] = useState(0); // track the current slice
  const [points, setPoints] = useState([] as number[][]);
  useEffect(() => {
    if (points.length > 0) {
      let posPoints = points.map((point) => {
        return [point[0] -125, point[1] -125, point[2] -125];
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
      //set background color
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
          // if the pixel values are in the range [0, 1], we can directly use them
          if (pixelValue <= 1) {
            normalizedValue = pixelValue * 255;
          } else {
            // normalize pixel value if it is in a different range (e.g., [0, 400] or [0, 65535])
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
        UpdatePointArray(niftiHeader, niftiImage);
        console.log("Number of slices:", slices);
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

        Draw(0, niftiHeader, niftiImage); // initial slice drawing
      } else {
        console.error("The uploaded file is not a valid NIFTI file.");
        alert("The uploaded file is not a valid NIFTI file.");
      }
    } catch (error) {
      console.error("Error processing the NIFTI file:", error);
      alert("Error processing the file. Please check the console for details.");
    }
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

    const imageData = ctx.createImageData(cols, rows); // create ImageData for the correct canvas size
    const sliceOffset = slice * cols * rows;
    const dataView = new DataView(image);

    // define possible ranges based on datatype and expected intensity ranges
    const maxRange = 400; // image range pixel values

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const pixelIndex = sliceOffset + row * cols + col;
        let pixelValue: number;

        // Get the pixel value based on data type
        if (header.datatypeCode === nif.NIFTI1.TYPE_UINT16) {
          pixelValue = dataView.getUint16(pixelIndex * 2, true);
        } else if (header.datatypeCode === nif.NIFTI1.TYPE_FLOAT32) {
          pixelValue = dataView.getFloat32(pixelIndex * 4, true);
        } else if (header.datatypeCode === nif.NIFTI1.TYPE_UINT8) {
          pixelValue = dataView.getUint8(pixelIndex);
        } else {
          pixelValue = 0; // default if datatype is unsupported
          console.warn("Unsupported NIFTI data type: ", header.datatypeCode);
        }

        // normalize pixel values based on their range (0 to 1 if already between 0 and 1)
        let normalizedValue = pixelValue;

        // if the pixel values are in the range [0, 1], we can directly use them
        if (pixelValue <= 1) {
          normalizedValue = pixelValue * 255;
        } else {
          // normalize pixel value if it is in a different range (e.g., [0, 400] or [0, 65535])
          normalizedValue = Math.min(
            Math.max((pixelValue / maxRange) * 255, 0),
            255
          );
        }

        const index = (row * cols + col) * 4; // pixel get rgb values

        // Set the pixel to grayscale (since it's medical image data)
        imageData.data[index] = normalizedValue;
        imageData.data[index + 1] = normalizedValue;
        imageData.data[index + 2] = normalizedValue;
        imageData.data[index + 3] = 255; // full opacity
      }
    }

    console.log("Drawing slice:", slice);
    ctx.putImageData(imageData, 0, 0); // directly render the pixel data
  }

  return (
    <div className={`flex flex-col items-center align-middle w-full`}>
      <div className="w-full flex justify-center items-center">
        <div className="w-[20%] flex flex-col items-center">
          <p>Upload a File</p>
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
          <input type="range" id="layer" />
          <div>
            <p>
              Current Slice: <span>{sliceIndex + 1}</span>
            </p>{" "}
            {}
          </div>
          <button
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
        <canvas id="result" className="w-[80%] h-screen"></canvas>
        <div className=" w-full h-screen bg-red-500">
          <div className="w-full h-full">
            <canvas id="result" className="w-full h-full"></canvas>
          </div>
        </div>
      </div>
    </div>
  );
}

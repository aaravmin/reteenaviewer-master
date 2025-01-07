import * as nif from "nifti-reader-js";
import { upload } from "@vercel/blob/client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function Home() {
  // MAIN volume
  const [fileVol, setFileVol] = useState<ArrayBuffer | null>(null);
  const [headerVol, setHeaderVol] = useState<nif.NIFTI1 | nif.NIFTI2 | null>(null);
  const [imageVol, setImageVol] = useState<ArrayBuffer | null>(null);

  // SUPER‐RES volume
  const [fileSR, setFileSR] = useState<ArrayBuffer | null>(null);
  const [headerSR, setHeaderSR] = useState<nif.NIFTI1 | nif.NIFTI2 | null>(null);
  const [imageSR, setImageSR] = useState<ArrayBuffer | null>(null);

  // SEGMENTATION volume
  const [fileSeg, setFileSeg] = useState<ArrayBuffer | null>(null);
  const [headerSeg, setHeaderSeg] = useState<nif.NIFTI1 | nif.NIFTI2 | null>(null);
  const [imageSeg, setImageSeg] = useState<ArrayBuffer | null>(null);

  // Orth slices
  const [sliceX, setSliceX] = useState(0); // Sagittal
  const [sliceY, setSliceY] = useState(0); // Coronal
  const [sliceZ, setSliceZ] = useState(0); // Axial

  // 3D point cloud
  const [points, setPoints] = useState<number[][]>([]);

  // Super‐Resolution metrics
  const [mseSR, setMseSR] = useState<number | null>(null);
  const [psnrSR, setPsnrSR] = useState<number | null>(null);
  const [ssimSR, setSsimSR] = useState<number | null>(null);

  // Segmentation metric
  const [diceSeg, setDiceSeg] = useState<number | null>(null);

  // Canvas refs
  const axialRef = useRef<HTMLCanvasElement | null>(null);
  const coronalRef = useRef<HTMLCanvasElement | null>(null);
  const sagittalRef = useRef<HTMLCanvasElement | null>(null);

  // Dragging state for each canvas
  const axialDraggingRef = useRef<boolean>(false);
  const coronalDraggingRef = useRef<boolean>(false);
  const sagittalDraggingRef = useRef<boolean>(false);

  /*******************************************************
   * LOAD THE MAIN VOLUME
   * => sets sliceX/Y/Z to 50% in loadVolume
   *******************************************************/
  useEffect(() => {
    if (fileVol) {
      loadVolume(fileVol, (hdr) => setHeaderVol(hdr), (img) => setImageVol(img));
    }
  }, [fileVol]);

  /*******************************************************
   * BUILD POINT CLOUD WHEN main volume ready
   *******************************************************/
  useEffect(() => {
    if (headerVol && imageVol) {
      buildPointCloud(headerVol, imageVol);
    }
  }, [headerVol, imageVol]);

  /*******************************************************
   * LOAD SUPER‐RES + METRICS
   *******************************************************/
  useEffect(() => {
    if (fileSR) {
      loadVolume(fileSR, setHeaderSR, setImageSR);
    }
  }, [fileSR]);

  useEffect(() => {
    if (headerVol && imageVol && headerSR && imageSR) {
      computeSRMetrics(headerVol, imageVol, headerSR, imageSR);
    }
  }, [headerVol, imageVol, headerSR, imageSR]);

  /*******************************************************
   * LOAD SEGMENTATION + METRICS
   *******************************************************/
  useEffect(() => {
    if (fileSeg) {
      loadVolume(fileSeg, setHeaderSeg, setImageSeg);
    }
  }, [fileSeg]);

  useEffect(() => {
    if (headerSeg && imageSeg) {
      computeDiceSeg(headerSeg, imageSeg);
    }
  }, [headerSeg, imageSeg]);

  /*******************************************************
   * RENDER 3D POINT CLOUD
   *******************************************************/
  useEffect(() => {
    document.querySelectorAll("canvas[data-engine='three']").forEach((c) => c.remove());
    if (points.length === 0) return;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(400, 400);
    renderer.domElement.setAttribute("data-engine", "three");
    document.body.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 2000);
    camera.position.set(256, 256, 256);

    const controls = new OrbitControls(camera, renderer.domElement);

    const geometry = new THREE.BufferGeometry();
    const pos = points.flatMap(([x, y, z]) => [x - 128, y - 128, z - 128]);
    const colors = points.flatMap(([, , , intensity]) => {
      const c = intensity / 255;
      return [c, c, c];
    });
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(pos), 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(colors), 3));

    const material = new THREE.PointsMaterial({ size: 2, vertexColors: true });
    const pc = new THREE.Points(geometry, material);
    scene.add(pc);

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
  }, [points]);

  /*******************************************************
   * CLICK‐AND‐DRAG FOR SLICES
   *******************************************************/
  useEffect(() => {
    const axCanvas = axialRef.current;
    const coCanvas = coronalRef.current;
    const saCanvas = sagittalRef.current;
    if (!axCanvas || !coCanvas || !saCanvas) return;

    // Axial
    const downAx = (e: MouseEvent) => {
      axialDraggingRef.current = true;
      handleAxial(e);
    };
    const moveAx = (e: MouseEvent) => {
      if (axialDraggingRef.current) handleAxial(e);
    };
    const upAx = () => { axialDraggingRef.current = false; };

    axCanvas.addEventListener("mousedown", downAx);
    axCanvas.addEventListener("mousemove", moveAx);
    window.addEventListener("mouseup", upAx);

    // Coronal
    const downCo = (e: MouseEvent) => {
      coronalDraggingRef.current = true;
      handleCoronal(e);
    };
    const moveCo = (e: MouseEvent) => {
      if (coronalDraggingRef.current) handleCoronal(e);
    };
    const upCo = () => { coronalDraggingRef.current = false; };

    coCanvas.addEventListener("mousedown", downCo);
    coCanvas.addEventListener("mousemove", moveCo);
    window.addEventListener("mouseup", upCo);

    // Sagittal
    const downSa = (e: MouseEvent) => {
      sagittalDraggingRef.current = true;
      handleSagittal(e);
    };
    const moveSa = (e: MouseEvent) => {
      if (sagittalDraggingRef.current) handleSagittal(e);
    };
    const upSa = () => { sagittalDraggingRef.current = false; };

    saCanvas.addEventListener("mousedown", downSa);
    saCanvas.addEventListener("mousemove", moveSa);
    window.addEventListener("mouseup", upSa);

    return () => {
      axCanvas.removeEventListener("mousedown", downAx);
      axCanvas.removeEventListener("mousemove", moveAx);
      window.removeEventListener("mouseup", upAx);

      coCanvas.removeEventListener("mousedown", downCo);
      coCanvas.removeEventListener("mousemove", moveCo);
      window.removeEventListener("mouseup", upCo);

      saCanvas.removeEventListener("mousedown", downSa);
      saCanvas.removeEventListener("mousemove", moveSa);
      window.removeEventListener("mouseup", upSa);
    };
  }, [axialRef, coronalRef, sagittalRef, headerVol]);

  function handleAxial(e: MouseEvent) {
    if (!headerVol) return;
    const canvas = axialRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((headerVol.dims[1] / canvas.width) * (e.clientX - rect.left));
    const y = Math.floor((headerVol.dims[2] / canvas.height) * (e.clientY - rect.top));
    setSliceX(x);
    setSliceY(y);
  }

  function handleCoronal(e: MouseEvent) {
    if (!headerVol) return;
    const canvas = coronalRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((headerVol.dims[1] / canvas.width) * (e.clientX - rect.left));
    const z = Math.floor((headerVol.dims[3] / canvas.height) * (e.clientY - rect.top));
    // No flips here => we rely on flipping in the drawCoronal loop
    setSliceX(x);
    setSliceZ(z);
  }

  function handleSagittal(e: MouseEvent) {
    if (!headerVol) return;
    const canvas = sagittalRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = Math.floor((headerVol.dims[2] / canvas.width) * (e.clientX - rect.left));
    const z = Math.floor((headerVol.dims[3] / canvas.height) * (e.clientY - rect.top));
    // No flips => rely on flipping in the drawSagittal loop
    setSliceY(y);
    setSliceZ(z);
  }

  /*******************************************************
   * DRAW SLICES
   * We now do the flipping *inside* drawCoronal/drawSagittal
   *******************************************************/
  useEffect(() => {
    if (headerVol && imageVol) {
      drawAxial(sliceZ, headerVol, imageVol);
      drawCoronal(sliceY, headerVol, imageVol);
      drawSagittal(sliceX, headerVol, imageVol);
    }
  }, [sliceX, sliceY, sliceZ, headerVol, imageVol]);

  function drawAxial(zSlice: number, hdr: nif.NIFTI1 | nif.NIFTI2, volData: ArrayBuffer) {
    // Axial is normal
    const canvas = axialRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const [ , cols, rows, slices ] = hdr.dims;
    canvas.width = cols;
    canvas.height = rows;

    const dv = new DataView(volData);
    const sliceOffset = zSlice * cols * rows;
    const maxRange = 400;

    const imgData = ctx.createImageData(cols, rows);

    // No flipping => normal top→bottom
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = sliceOffset + y * cols + x;
        const val = getVoxelValue(hdr, dv, idx);
        const norm = val <= 1 ? val * 255 : Math.min((val / maxRange) * 255, 255);
        const px4 = (y * cols + x) * 4;
        imgData.data[px4 + 0] = norm;
        imgData.data[px4 + 1] = norm;
        imgData.data[px4 + 2] = norm;
        imgData.data[px4 + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function drawCoronal(ySlice: number, hdr: nif.NIFTI1 | nif.NIFTI2, volData: ArrayBuffer) {
    // We'll flip it by painting from bottom up
    const canvas = coronalRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const [ , cols, rows, slices ] = hdr.dims;
    canvas.width = cols;
    canvas.height = slices;

    const dv = new DataView(volData);
    const maxRange = 400;
    const imgData = ctx.createImageData(cols, slices);

    // paint from z=0 at *top* => means we fill from the BOTTOM of imageData
    // so index in imageData is reversed in the vertical dimension
    for (let z = 0; z < slices; z++) {
      for (let x = 0; x < cols; x++) {
        const voxelIndex = z * rows * cols + ySlice * cols + x;
        const val = getVoxelValue(hdr, dv, voxelIndex);
        const norm = val <= 1 ? val * 255 : Math.min((val / maxRange) * 255, 255);

        // "Flipped" row => let flippedZ = (slices - 1) - z
        const flippedZ = (slices - 1) - z;
        const px4 = (flippedZ * cols + x) * 4;

        imgData.data[px4 + 0] = norm;
        imgData.data[px4 + 1] = norm;
        imgData.data[px4 + 2] = norm;
        imgData.data[px4 + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function drawSagittal(xSlice: number, hdr: nif.NIFTI1 | nif.NIFTI2, volData: ArrayBuffer) {
    // We'll flip it top→bottom as well
    const canvas = sagittalRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const [ , cols, rows, slices ] = hdr.dims;
    // sagittal => width = rows, height = slices
    canvas.width = rows;
    canvas.height = slices;

    const dv = new DataView(volData);
    const maxRange = 400;
    const imgData = ctx.createImageData(rows, slices);

    // For each z in [0..slices-1], for each y in [0..rows-1],
    // we read voxelIndex = z*rows*cols + y*cols + xSlice
    // and paint into flippedZ row
    for (let z = 0; z < slices; z++) {
      for (let y = 0; y < rows; y++) {
        const voxelIndex = z * rows * cols + y * cols + xSlice;
        const val = getVoxelValue(hdr, dv, voxelIndex);
        const norm = val <= 1 ? val * 255 : Math.min((val / maxRange) * 255, 255);

        // Flip vertically => let flippedZ = (slices - 1) - z
        const flippedZ = (slices - 1) - z;
        const px4 = (flippedZ * rows + y) * 4;

        imgData.data[px4 + 0] = norm;
        imgData.data[px4 + 1] = norm;
        imgData.data[px4 + 2] = norm;
        imgData.data[px4 + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  /*******************************************************
   * SUPER‐RES METRICS
   *******************************************************/
  function computeSRMetrics(
    hdrA: nif.NIFTI1 | nif.NIFTI2,
    bufA: ArrayBuffer,
    hdrB: nif.NIFTI1 | nif.NIFTI2,
    bufB: ArrayBuffer
  ) {
    const dims = hdrA.dims;
    const totalVoxels = dims[1] * dims[2] * dims[3];

    const dvA = new DataView(bufA);
    const dvB = new DataView(bufB);

    let sumSq = 0;
    let maxVal = 0;
    for (let i = 0; i < totalVoxels; i++) {
      const vA = getVoxelValue(hdrA, dvA, i);
      const vB = getVoxelValue(hdrB, dvB, i);
      const diff = vA - vB;
      sumSq += diff * diff;
      if (vA > maxVal) maxVal = vA;
      if (vB > maxVal) maxVal = vB;
    }
    const mseVal = sumSq / totalVoxels;
    let psnrVal = Infinity;
    if (mseVal > 0) {
      psnrVal = 10 * Math.log10((maxVal * maxVal) / mseVal);
    }
    // dummy SSIM
    const ssimVal = 0.95;
    setMseSR(mseVal);
    setPsnrSR(psnrVal);
    setSsimSR(ssimVal);
  }

  /*******************************************************
   * SEG METRIC
   *******************************************************/
  function computeDiceSeg(hdr: nif.NIFTI1 | nif.NIFTI2, buf: ArrayBuffer) {
    // placeholder
    setDiceSeg(0.88);
  }

  /*******************************************************
   * HELPERS
   *******************************************************/
  async function loadVolume(
    fileBuf: ArrayBuffer,
    setHdr: (h: nif.NIFTI1 | nif.NIFTI2) => void,
    setImg: (b: ArrayBuffer) => void
  ) {
    try {
      let buf = fileBuf;
      if (nif.isCompressed(buf)) {
        buf = nif.decompress(buf) as ArrayBuffer;
      }
      if (!nif.isNIFTI(buf)) {
        alert("Not a valid NIFTI file!");
        return;
      }
      const hdr = nif.readHeader(buf);
      if (!hdr) {
        alert("NIFTI header is null!");
        return;
      }
      const img = nif.readImage(hdr, buf);

      // IMMEDIATELY set slices to halfway
      const [ , dx, dy, dz ] = hdr.dims;
      setSliceX(Math.floor(dx / 2));
      setSliceY(Math.floor(dy / 2));
      setSliceZ(Math.floor(dz / 2));

      setHdr(hdr);
      setImg(img);
    } catch (err) {
      console.error(err);
      alert("Error loading volume. Check console.");
    }
  }

  function getVoxelValue(
    hdr: nif.NIFTI1 | nif.NIFTI2,
    dv: DataView,
    idx: number
  ): number {
    switch (hdr.datatypeCode) {
      case nif.NIFTI1.TYPE_UINT8:
        return dv.getUint8(idx);
      case nif.NIFTI1.TYPE_UINT16:
        return dv.getUint16(idx * 2, true);
      case nif.NIFTI1.TYPE_FLOAT32:
        return dv.getFloat32(idx * 4, true);
      default:
        return 0;
    }
  }

  function buildPointCloud(hdr: nif.NIFTI1 | nif.NIFTI2, data: ArrayBuffer) {
    const dv = new DataView(data);
    const [ , dx, dy, dz ] = hdr.dims;
    const maxRange = 400;
    const newPts: number[][] = [];

    for (let z = 0; z < dz; z++) {
      for (let y = 0; y < dy; y++) {
        for (let x = 0; x < dx; x++) {
          const idx = z * dy * dx + y * dx + x;
          const val = getVoxelValue(hdr, dv, idx);
          const norm = val <= 1 ? val * 255 : Math.min((val / maxRange) * 255, 255);
          if (norm > 1) {
            newPts.push([x, y, z, norm]);
          }
        }
      }
    }
    setPoints(newPts);
  }

  /*******************************************************
   * RENDER
   *******************************************************/
  return (
    <div className="flex w-full min-h-screen bg-gray-100">
      {/* LEFT PANEL */}
      <div className="w-1/4 p-4 bg-white border-r border-gray-300 flex flex-col gap-4">
        <h2 className="text-xl font-bold text-black">Reteena</h2>

        {/* LOAD MAIN */}
        <div className="flex flex-col text-sm gap-2">
          <label className="font-semibold text-black">Main Volume (NIFTI)</label>
          <input
            type="file"
            className="text-black truncate"
            onChange={async (e) => {
              if (e.target.files?.[0]) {
                const buf = await e.target.files[0].arrayBuffer();
                // reset
                setFileVol(buf);
                setFileSR(null);
                setFileSeg(null);
                setMseSR(null);
                setPsnrSR(null);
                setSsimSR(null);
                setDiceSeg(null);
              }
            }}
          />
        </div>

        {/* SUPER‐RES METRICS */}
        <div className="flex flex-col text-sm gap-1">
          <p className="font-semibold text-black">Super‐Resolution Metrics:</p>
          <p className="text-black">
            MSE: {mseSR == null ? "—" : mseSR.toFixed(2)}
          </p>
          <p className="text-black">
            PSNR: {psnrSR == null ? "—" : psnrSR === Infinity ? "∞" : psnrSR.toFixed(2)}
          </p>
          <p className="text-black">
            SSIM: {ssimSR == null ? "—" : ssimSR.toFixed(3)}
          </p>
        </div>

        {/* SEG METRIC */}
        <div className="flex flex-col text-sm gap-1">
          <p className="font-semibold text-black">Segmentation Metric:</p>
          <p className="text-black">
            Dice: {diceSeg == null ? "—" : diceSeg.toFixed(2)}
          </p>
        </div>

        {/* RUN SUPER‐RES */}
        <button
          className="rounded bg-gray-500 text-white py-2 px-3"
          onClick={async () => {
            if (!fileVol) {
              alert("No main volume loaded.");
              return;
            }
            try {
              const upRes = await upload("scans", fileVol, {
                access: "public",
                handleUploadUrl: "/api/upload",
              });
              const resp = await fetch("/api/runSuperRes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ location: upRes.url }),
              });
              const j = await resp.json();
              const srBuf = await (await fetch(j.url)).arrayBuffer();
              setFileSR(srBuf);
            } catch (err) {
              console.error(err);
              alert("Error running super‐resolution.");
            }
          }}
        >
          Run Super‐Resolution Model
        </button>

        {/* RUN SEG */}
        <button
          className="rounded bg-gray-500 text-white py-2 px-3"
          onClick={async () => {
            if (!fileVol) {
              alert("No main volume loaded.");
              return;
            }
            try {
              const upRes = await upload("scans", fileVol, {
                access: "public",
                handleUploadUrl: "/api/upload",
              });
              const resp = await fetch("/api/runSeg", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ location: upRes.url }),
              });
              const j = await resp.json();
              const segBuf = await (await fetch(j.url)).arrayBuffer();
              setFileSeg(segBuf);
            } catch (err) {
              console.error(err);
              alert("Error running segmentation.");
            }
          }}
        >
          Run Segmentation Model
        </button>
      </div>

      {/* RIGHT 2×2 */}
      <div className="flex-grow grid grid-cols-2 grid-rows-2 gap-4 p-4">
        {/* Axial */}
        <div className="relative flex items-center justify-center border border-gray-400 bg-black">
          <canvas ref={axialRef} className="bg-black" />
          <div className="absolute bottom-2 text-white text-xs">
            Axial (Z): {sliceZ}
          </div>
        </div>

        {/* Coronal */}
        <div className="relative flex items-center justify-center border border-gray-400 bg-black">
          <canvas ref={coronalRef} className="bg-black" />
          <div className="absolute bottom-2 text-white text-xs">
            Coronal (Y): {sliceY}
          </div>
        </div>

        {/* Sagittal */}
        <div className="relative flex items-center justify-center border border-gray-400 bg-black">
          <canvas ref={sagittalRef} className="bg-black" />
          <div className="absolute bottom-2 text-white text-xs">
            Sagittal (X): {sliceX}
          </div>
        </div>

        <div className="relative flex items-center justify-center border border-gray-400 bg-white">
          <p className="text-gray-600 text-sm">[ 4th Quadrant Preview ]</p>
        </div>
      </div>
    </div>
  );
}

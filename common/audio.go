package common

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"strings"

	"github.com/abema/go-mp4"
	"github.com/go-audio/aiff"
	"github.com/go-audio/wav"
	"github.com/mewkiz/flac"
	"github.com/pkg/errors"
	"github.com/tcolgate/mp3"
	"github.com/yapingcat/gomedia/go-codec"
)

// GetAudioDuration 使用纯 Go 库获取音频文件的时长（秒）。
// 它不再依赖外部的 ffmpeg 或 ffprobe 程序。
func GetAudioDuration(ctx context.Context, f io.ReadSeeker, ext string) (duration float64, err error) {
	if ctx != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return 0, ctxErr
		}
	}
	SysLog(LogText("GetAudioDuration: ext=%s", ext))
	ext = strings.ToLower(ext)
	// 根据文件扩展名选择解析器
	switch ext {
	case ".mp3":
		duration, err = getMP3Duration(f)
	case ".wav":
		duration, err = getWAVDuration(f)
	case ".flac":
		duration, err = getFLACDuration(f)
	case ".m4a", ".mp4":
		duration, err = getM4ADuration(f)
	case ".ogg", ".oga", ".opus":
		duration, err = scanOGGContainerDuration(ctx, f)
	case ".aiff", ".aif", ".aifc":
		duration, err = getAIFFDuration(f)
	case ".webm":
		duration, err = getWebMDuration(f)
	case ".aac":
		duration, err = getAACDuration(f)
	default:
		return 0, fmt.Errorf("unsupported audio format: %s", ext)
	}
	if err == nil && (math.IsNaN(duration) || math.IsInf(duration, 0) || duration <= 0) {
		return 0, errors.New("audio duration is zero or invalid")
	}
	SysLog(LogText("GetAudioDuration: duration=%f", duration))
	return duration, err
}

// getMP3Duration 解析 MP3 文件以获取时长。
// 注意：对于 VBR (Variable Bitrate) MP3，这个估算可能不完全精确，但通常足够好。
// FFmpeg 在这种情况下会扫描整个文件来获得精确值，但这里的库提供了快速估算。
func getMP3Duration(r io.Reader) (float64, error) {
	d := mp3.NewDecoder(r)
	var f mp3.Frame
	skipped := 0
	duration := 0.0

	for {
		if err := d.Decode(&f, &skipped); err != nil {
			if err == io.EOF {
				break
			}
			return 0, errors.Wrap(err, "failed to decode mp3 frame")
		}
		duration += f.Duration().Seconds()
	}
	return duration, nil
}

// getWAVDuration 解析 WAV 文件头以获取时长。
func getWAVDuration(r io.ReadSeeker) (float64, error) {
	// 1. 强制复位指针
	r.Seek(0, io.SeekStart)

	dec := wav.NewDecoder(r)

	// IsValidFile 会读取 fmt 块
	if !dec.IsValidFile() {
		return 0, errors.New("invalid wav file")
	}

	// 尝试寻找 data 块
	if err := dec.FwdToPCM(); err != nil {
		return 0, errors.Wrap(err, "failed to find PCM data chunk")
	}

	pcmSize := int64(dec.PCMSize)

	// 如果读出来的 Size 是 0，尝试用文件大小反推
	if pcmSize == 0 {
		// 获取文件总大小
		currentPos, _ := r.Seek(0, io.SeekCurrent) // 当前通常在 data chunk header 之后
		endPos, _ := r.Seek(0, io.SeekEnd)
		fileSize := endPos

		// 恢复位置（虽然如果不继续读也没关系）
		r.Seek(currentPos, io.SeekStart)

		// 数据区大小 ≈ 文件总大小 - 当前指针位置(即Header大小)
		// 注意：FwdToPCM 成功后，CurrentPos 应该刚好指向 Data 区数据的开始
		// 或者是 Data Chunk ID + Size 之后。
		// WAV Header 一般 44 字节。
		if fileSize > 44 {
			// 如果 FwdToPCM 成功，Reader 应该位于 data 块的数据起始处
			// 所以剩余的所有字节理论上都是音频数据
			pcmSize = fileSize - currentPos

			// 简单的兜底：如果算出来还是负数或0，强制按文件大小-44计算
			if pcmSize <= 0 {
				pcmSize = fileSize - 44
			}
		}
	}

	numChans := int64(dec.NumChans)
	bitDepth := int64(dec.BitDepth)
	sampleRate := float64(dec.SampleRate)

	if sampleRate == 0 || numChans == 0 || bitDepth == 0 {
		return 0, errors.New("invalid wav header metadata")
	}

	bytesPerFrame := numChans * (bitDepth / 8)
	if bytesPerFrame == 0 {
		return 0, errors.New("invalid byte depth calculation")
	}

	totalFrames := pcmSize / bytesPerFrame

	durationSeconds := float64(totalFrames) / sampleRate
	return durationSeconds, nil
}

// getFLACDuration 解析 FLAC 文件的 STREAMINFO 块。
func getFLACDuration(r io.Reader) (float64, error) {
	stream, err := flac.Parse(r)
	if err != nil {
		return 0, errors.Wrap(err, "failed to parse flac stream")
	}
	defer stream.Close()

	if stream.Info.SampleRate == 0 || stream.Info.NSamples == 0 {
		return 0, errors.New("invalid or streamed flac metadata with zero sample rate or sample count")
	}
	duration := float64(stream.Info.NSamples) / float64(stream.Info.SampleRate)
	return duration, nil
}

// getM4ADuration 解析 M4A/MP4 文件的 'mvhd' box。
func getM4ADuration(r io.ReadSeeker) (float64, error) {
	info, err := mp4.Probe(r)
	if err != nil {
		return 0, errors.Wrap(err, "failed to probe m4a/mp4 file")
	}
	if info.Timescale == 0 || info.Duration == 0 {
		return 0, errors.New("invalid or fragmented m4a/mp4 metadata with zero timescale or duration")
	}
	return float64(info.Duration) / float64(info.Timescale), nil
}

// scanOGGContainerDuration 通过扫描 OGG 页面头部（Vorbis / Opus / Speex）获取时长，
// 避免全量解码音频采样导致高 CPU / 内存消耗，同时避免逐字节回退寻址放大。
func scanOGGContainerDuration(ctx context.Context, r io.ReadSeeker) (float64, error) {
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return 0, errors.Wrap(err, "failed to seek ogg file")
	}

	var firstHdr [27]byte
	if _, err := io.ReadFull(r, firstHdr[:]); err != nil {
		return 0, errors.Wrap(err, "failed to read first ogg page header")
	}
	if !bytes.Equal(firstHdr[0:4], []byte("OggS")) || firstHdr[4] != 0 {
		return 0, errors.New("invalid ogg capture pattern")
	}

	firstSegCount := int(firstHdr[26])
	firstSegTable := make([]byte, firstSegCount)
	if _, err := io.ReadFull(r, firstSegTable); err != nil {
		return 0, errors.Wrap(err, "failed to read first ogg segment table")
	}
	firstBodyLen := 0
	for _, seg := range firstSegTable {
		firstBodyLen += int(seg)
	}
	if firstBodyLen < 8 {
		return 0, errors.New("ogg identification packet too short")
	}
	identRead := min(firstBodyLen, 64)
	identBuf := make([]byte, identRead)
	if _, err := io.ReadFull(r, identBuf); err != nil {
		return 0, errors.Wrap(err, "failed to read ogg identification packet")
	}

	var sampleRate uint32
	var preSkip int64
	switch {
	case len(identBuf) >= 16 && identBuf[0] == 0x01 && bytes.Equal(identBuf[1:7], []byte("vorbis")):
		sampleRate = binary.LittleEndian.Uint32(identBuf[12:16])
	case len(identBuf) >= 12 && bytes.Equal(identBuf[0:8], []byte("OpusHead")):
		sampleRate = 48000
		preSkip = int64(binary.LittleEndian.Uint16(identBuf[10:12]))
	case len(identBuf) >= 40 && bytes.Equal(identBuf[0:8], []byte("Speex   ")):
		sampleRate = binary.LittleEndian.Uint32(identBuf[36:40])
	default:
		return 0, errors.New("unsupported ogg codec identification header")
	}
	if sampleRate == 0 {
		return 0, errors.New("invalid ogg sample rate")
	}

	var maxGranulePos int64
	if firstGP := int64(binary.LittleEndian.Uint64(firstHdr[6:14])); firstGP > 0 {
		maxGranulePos = firstGP
	}

	// Fast path: scan the final 64 KiB tail for the last valid OggS page.
	if endPos, err := r.Seek(0, io.SeekEnd); err == nil && endPos > 27 {
		tailLen := min(endPos, int64(65536))
		if _, seekErr := r.Seek(endPos-tailLen, io.SeekStart); seekErr == nil {
			tail := make([]byte, tailLen)
			if n, readErr := io.ReadFull(r, tail); readErr == nil || readErr == io.ErrUnexpectedEOF {
				tail = tail[:n]
				for pos := len(tail) - 27; pos >= 0; pos-- {
					if tail[pos] != 'O' || !bytes.Equal(tail[pos:pos+4], []byte("OggS")) || tail[pos+4] != 0 {
						continue
					}
					segCount := int(tail[pos+26])
					if pos+27+segCount > len(tail) {
						continue
					}
					gp := int64(binary.LittleEndian.Uint64(tail[pos+6 : pos+14]))
					if gp > maxGranulePos {
						maxGranulePos = gp
						break
					}
				}
			}
		}
	}

	// Fallback: sequential page skip if tail did not contain a positive granule position.
	if maxGranulePos <= 0 {
		if _, err := r.Seek(0, io.SeekStart); err != nil {
			return 0, errors.Wrap(err, "failed to rewind ogg file")
		}
		const maxPages = 200000
		var hdr [27]byte
		var segTable [255]byte
		for pageIdx := range maxPages {
			if ctx != nil && pageIdx%256 == 0 {
				if ctxErr := ctx.Err(); ctxErr != nil {
					return 0, ctxErr
				}
			}
			if _, err := io.ReadFull(r, hdr[:]); err != nil {
				if err == io.EOF || err == io.ErrUnexpectedEOF {
					break
				}
				return 0, errors.Wrap(err, "failed to read ogg page header")
			}
			if !bytes.Equal(hdr[0:4], []byte("OggS")) || hdr[4] != 0 {
				return 0, errors.New("corrupted ogg page alignment")
			}
			gp := int64(binary.LittleEndian.Uint64(hdr[6:14]))
			if gp > maxGranulePos {
				maxGranulePos = gp
			}
			segCount := int(hdr[26])
			if _, err := io.ReadFull(r, segTable[:segCount]); err != nil {
				break
			}
			bodyLen := 0
			for i := range segCount {
				bodyLen += int(segTable[i])
			}
			if _, err := r.Seek(int64(bodyLen), io.SeekCurrent); err != nil {
				break
			}
		}
	}

	effectiveSamples := maxGranulePos
	if preSkip > 0 && effectiveSamples > preSkip {
		effectiveSamples -= preSkip
	}
	if effectiveSamples <= 0 {
		return 0, errors.New("ogg stream has zero granule duration")
	}
	return float64(effectiveSamples) / float64(sampleRate), nil
}

// getAIFFDuration 解析 AIFF 文件头以获取时长。
func getAIFFDuration(r io.ReadSeeker) (float64, error) {
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return 0, errors.Wrap(err, "failed to seek aiff file")
	}

	dec := aiff.NewDecoder(r)
	if !dec.IsValidFile() {
		return 0, errors.New("invalid aiff file")
	}

	d, err := dec.Duration()
	if err != nil {
		return 0, errors.Wrap(err, "failed to get aiff duration")
	}

	return d.Seconds(), nil
}

// getWebMDuration 解析 WebM 文件以获取时长。
// WebM 使用 Matroska 容器格式
func getWebMDuration(r io.ReadSeeker) (float64, error) {
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return 0, errors.Wrap(err, "failed to seek webm file")
	}

	// WebM/Matroska 文件的解析比较复杂
	// 这里提供一个简化的实现，读取 EBML 头部
	// 对于完整的 WebM 解析，可能需要使用专门的库

	// 简单实现：查找 Duration 元素
	// WebM Duration 的 Element ID 是 0x4489
	// 这是一个简化版本，可能不适用于所有 WebM 文件
	buf := make([]byte, 8192)
	n, err := r.Read(buf)
	if err != nil && err != io.EOF {
		return 0, errors.Wrap(err, "failed to read webm file")
	}

	// 尝试查找 Duration 元素（这是一个简化的方法）
	// 实际的 WebM 解析需要完整的 EBML 解析器
	// 这里返回错误，建议使用专门的库
	if n > 0 {
		// 检查 EBML 标识
		if len(buf) >= 4 && binary.BigEndian.Uint32(buf[0:4]) == 0x1A45DFA3 {
			// 这是一个有效的 EBML 文件
			// 但完整解析需要更复杂的逻辑
			return 0, errors.New("webm duration parsing requires full EBML parser (consider using ffprobe for webm files)")
		}
	}

	return 0, errors.New("failed to parse webm file")
}

// getAACDuration 解析 AAC (ADTS格式) 文件以获取时长。
// 使用 gomedia 库来解析 AAC ADTS 帧
func getAACDuration(r io.ReadSeeker) (float64, error) {
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return 0, errors.Wrap(err, "failed to seek aac file")
	}

	// 读取整个文件内容
	data, err := io.ReadAll(r)
	if err != nil {
		return 0, errors.Wrap(err, "failed to read aac file")
	}

	var totalFrames int64
	var sampleRate int

	// 使用 gomedia 的 SplitAACFrame 函数来分割 AAC 帧
	codec.SplitAACFrame(data, func(aac []byte) {
		// 解析 ADTS 头部以获取采样率信息
		if len(aac) >= 7 {
			// 使用 ConvertADTSToASC 来获取音频配置信息
			asc, err := codec.ConvertADTSToASC(aac)
			if err == nil && sampleRate == 0 {
				sampleRate = codec.AACSampleIdxToSample(int(asc.Sample_freq_index))
			}
			totalFrames++
		}
	})

	if sampleRate == 0 || totalFrames == 0 {
		return 0, errors.New("no valid aac frames found")
	}

	// 每个 AAC ADTS 帧包含 1024 个采样
	totalSamples := totalFrames * 1024
	duration := float64(totalSamples) / float64(sampleRate)
	return duration, nil
}

package common

import (
	"bytes"
	"context"
	"encoding/binary"
	"strings"
	"testing"
)

// minimalWAV builds a valid 16-bit PCM mono WAV with the given number of sample frames.
func minimalWAV(sampleRate uint32, frames int) []byte {
	const numChannels = 1
	const bitsPerSample = 16
	dataSize := frames * numChannels * (bitsPerSample / 8)
	buf := &bytes.Buffer{}
	buf.WriteString("RIFF")
	binary.Write(buf, binary.LittleEndian, uint32(36+dataSize))
	buf.WriteString("WAVE")
	buf.WriteString("fmt ")
	binary.Write(buf, binary.LittleEndian, uint32(16))
	binary.Write(buf, binary.LittleEndian, uint16(1)) // PCM
	binary.Write(buf, binary.LittleEndian, uint16(numChannels))
	binary.Write(buf, binary.LittleEndian, sampleRate)
	byteRate := sampleRate * numChannels * (bitsPerSample / 8)
	binary.Write(buf, binary.LittleEndian, byteRate)
	binary.Write(buf, binary.LittleEndian, uint16(numChannels*(bitsPerSample/8)))
	binary.Write(buf, binary.LittleEndian, uint16(bitsPerSample))
	buf.WriteString("data")
	binary.Write(buf, binary.LittleEndian, uint32(dataSize))
	buf.Write(make([]byte, dataSize))
	return buf.Bytes()
}

func TestGetAudioDurationCaseInsensitiveExt(t *testing.T) {
	wav := minimalWAV(8000, 8000) // 1 second

	for _, ext := range []string{".wav", ".WAV", ".Wav"} {
		d, err := GetAudioDuration(context.Background(), bytes.NewReader(wav), ext)
		if err != nil {
			t.Fatalf("ext %q: unexpected error: %v", ext, err)
		}
		if d < 0.99 || d > 1.01 {
			t.Fatalf("ext %q: expected ~1s duration, got %v", ext, d)
		}
	}
}

func TestGetAudioDurationUppercaseNotUnsupported(t *testing.T) {
	_, err := GetAudioDuration(context.Background(), bytes.NewReader([]byte("not audio")), ".MP3")
	if err != nil && strings.Contains(err.Error(), "unsupported audio format") {
		t.Fatalf("uppercase extension rejected as unsupported: %v", err)
	}
}

func minimalOGGPage(headerType byte, granulePos uint64, payload []byte) []byte {
	buf := &bytes.Buffer{}
	buf.WriteString("OggS")
	buf.WriteByte(0) // version
	buf.WriteByte(headerType)
	_ = binary.Write(buf, binary.LittleEndian, granulePos)
	_ = binary.Write(buf, binary.LittleEndian, uint32(1)) // serial
	_ = binary.Write(buf, binary.LittleEndian, uint32(0)) // seq
	_ = binary.Write(buf, binary.LittleEndian, uint32(0)) // crc (not checked by duration scanner)
	buf.WriteByte(1)                                      // 1 segment
	buf.WriteByte(byte(len(payload)))
	buf.Write(payload)
	return buf.Bytes()
}

func TestGetAudioDurationOGGPageScanAndZeroMetadataRejection(t *testing.T) {
	// Build minimal Vorbis identification packet (48000 Hz) + terminal page (96000 samples = 2.0s).
	vorbisIdent := make([]byte, 30)
	vorbisIdent[0] = 0x01
	copy(vorbisIdent[1:7], "vorbis")
	binary.LittleEndian.PutUint32(vorbisIdent[12:16], 48000)
	oggVorbis := append(minimalOGGPage(0x02, 0, vorbisIdent), minimalOGGPage(0x04, 96000, []byte{0x00})...)

	d, err := GetAudioDuration(context.Background(), bytes.NewReader(oggVorbis), ".ogg")
	if err != nil {
		t.Fatalf("unexpected ogg vorbis error: %v", err)
	}
	if d < 1.99 || d > 2.01 {
		t.Fatalf("expected 2.0s ogg vorbis duration, got %v", d)
	}

	// Build minimal OpusHead identification packet (preSkip=312) + terminal page (48312 samples => 48000/48000 = 1.0s).
	opusIdent := make([]byte, 19)
	copy(opusIdent[0:8], "OpusHead")
	opusIdent[8] = 1
	opusIdent[9] = 2
	binary.LittleEndian.PutUint16(opusIdent[10:12], 312)
	oggOpus := append(minimalOGGPage(0x02, 0, opusIdent), minimalOGGPage(0x04, 48312, []byte{0x00})...)

	dOpus, err := GetAudioDuration(context.Background(), bytes.NewReader(oggOpus), ".opus")
	if err != nil {
		t.Fatalf("unexpected opus error: %v", err)
	}
	if dOpus < 0.99 || dOpus > 1.01 {
		t.Fatalf("expected 1.0s opus duration, got %v", dOpus)
	}

	// Zero-duration WAV and zero-granule OGG must fail rather than returning 0 billable seconds.
	if _, err := GetAudioDuration(context.Background(), bytes.NewReader(minimalWAV(8000, 0)), ".wav"); err == nil {
		t.Fatal("expected error for 0-frame wav")
	}
	zeroGranuleOGG := minimalOGGPage(0x02, 0, vorbisIdent)
	if _, err := GetAudioDuration(context.Background(), bytes.NewReader(zeroGranuleOGG), ".ogg"); err == nil {
		t.Fatal("expected error for 0-granule ogg")
	}
}

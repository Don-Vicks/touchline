export function encodingExists(enc) {
  try {
    new TextDecoder(enc);
    return true;
  } catch {
    return false;
  }
}

export function decode(buf, enc) {
  return new TextDecoder(enc || "utf-8").decode(buf);
}

export function encode(str, enc) {
  return Buffer.from(str, enc || "utf-8");
}

export function getDecoder(enc) {
  const dec = new TextDecoder(enc || "utf-8");
  return {
    write(buf) {
      return dec.decode(buf, { stream: true });
    },
    end() {
      return dec.decode();
    },
  };
}

export default {
  encodingExists,
  decode,
  encode,
  getDecoder,
};

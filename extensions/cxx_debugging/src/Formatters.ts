// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  CustomFormatters,
  FormatterResult,
  type LazyObject,
  PrimitiveLazyObject,
  type TypeInfo,
  type Value,
  type WasmInterface,
} from "./CustomFormatters.js";
import type { ForeignObject } from "./WasmTypes.js";

/*
 * Numbers
 */
CustomFormatters.addFormatter({
  types: ["bool"],
  format: (wasm, value) => value.asUint8() > 0,
});
CustomFormatters.addFormatter({
  types: ["uint16_t"],
  format: (wasm, value) => value.asUint16(),
});
CustomFormatters.addFormatter({
  types: ["uint32_t"],
  format: (wasm, value) => value.asUint32(),
});
CustomFormatters.addFormatter({
  types: ["uint64_t"],
  format: (wasm, value) => value.asUint64(),
});

CustomFormatters.addFormatter({
  types: ["int16_t"],
  format: (wasm, value) => value.asInt16(),
});
CustomFormatters.addFormatter({
  types: ["int32_t"],
  format: (wasm, value) => value.asInt32(),
});
CustomFormatters.addFormatter({
  types: ["int64_t"],
  format: (wasm, value) => value.asInt64(),
});

CustomFormatters.addFormatter({
  types: ["float"],
  format: (wasm, value) => value.asFloat32(),
});
CustomFormatters.addFormatter({
  types: ["double"],
  format: (wasm, value) => value.asFloat64(),
});

export const enum Constants {
  MAX_STRING_LEN = (1 << 28) - 16, // This is the maximum string len for 32bit taken from V8
  PAGE_SIZE = 1 << 12, // Block size used for formatting strings when searching for the null terminator
  SAFE_HEAP_START = 1 << 10,
}
export function formatVoid(): () => LazyObject {
  return () => new PrimitiveLazyObject("undefined", undefined, "<void>");
}

CustomFormatters.addFormatter({ types: ["void"], format: formatVoid });

CustomFormatters.addFormatter({
  types: ["uint8_t", "int8_t"],
  format: formatChar,
});

export function formatChar(wasm: WasmInterface, value: Value): string {
  const char = value.typeNames.includes("int8_t")
    ? Math.abs(value.asInt8())
    : value.asUint8();
  switch (char) {
    case 0x0:
      return "'\\0'";
    case 0x7:
      return "'\\a'";
    case 0x8:
      return "'\\b'";
    case 0x9:
      return "'\\t'";
    case 0xa:
      return "'\\n'";
    case 0xb:
      return "'\\v'";
    case 0xc:
      return "'\\f'";
    case 0xd:
      return "'\\r'";
  }
  if (char < 0x20 || char > 0x7e) {
    return `'\\x${char.toString(16).padStart(2, "0")}'`;
  }
  return `'${String.fromCharCode(value.asInt8())}'`;
}

CustomFormatters.addFormatter({
  types: ["wchar_t", "char32_t", "char16_t"],
  format: (wasm, value) => {
    const codepoint = value.size === 2 ? value.asUint16() : value.asUint32();
    try {
      return String.fromCodePoint(codepoint);
    } catch {
      return `U+${codepoint.toString(16).padStart(value.size * 2, "0")}`;
    }
  },
});

/*
 * STL
 */
function formatLibCXXString<T extends CharArrayConstructor>(
  wasm: WasmInterface,
  value: Value,
  charType: T,
  decode: (chars: InstanceType<T>) => string,
): { size: number; string: string } {
  const shortString = value.$("__r_.__value_.<union>.__s");
  const size = shortString.getMembers().includes("<union>")
    ? shortString.$("<union>.__size_").asUint8()
    : shortString.$("__size_").asUint8();
  const isLong = 0 < (size & 0x80);
  const charSize = charType.BYTES_PER_ELEMENT;
  if (isLong) {
    const longString = value.$("__r_.__value_.<union>.__l");
    const data = longString.$("__data_").asUint32();
    const stringSize = longString.$("__size_").asUint32();

    const copyLen = Math.min(stringSize * charSize, Constants.MAX_STRING_LEN);
    const bytes = wasm.readMemory(data, copyLen);
    const text = new charType(
      bytes.buffer,
      bytes.byteOffset,
      stringSize,
    ) as InstanceType<T>;
    return { size: stringSize, string: decode(text) };
  }

  const bytes = shortString.$("__data_").asDataView(0, size * charSize);
  const text = new charType(
    bytes.buffer,
    bytes.byteOffset,
    size,
  ) as InstanceType<T>;
  return { size, string: decode(text) };
}

export function formatLibCXX8String(
  wasm: WasmInterface,
  value: Value,
): { size: number; string: string } {
  return formatLibCXXString(wasm, value, Uint8Array, (str) =>
    new TextDecoder().decode(str),
  );
}

export function formatLibCXX16String(
  wasm: WasmInterface,
  value: Value,
): { size: number; string: string } {
  return formatLibCXXString(wasm, value, Uint16Array, (str) =>
    new TextDecoder("utf-16le").decode(str),
  );
}

export function formatLibCXX32String(
  wasm: WasmInterface,
  value: Value,
): { size: number; string: string } {
  // emscripten's wchar is 4 byte
  return formatLibCXXString(wasm, value, Uint32Array, (str) =>
    Array.from(str)
      .map((v) => String.fromCodePoint(v))
      .join(""),
  );
}

CustomFormatters.addFormatter({
  types: [
    "std::__2::string",
    "std::__2::basic_string<char, std::__2::char_traits<char>, std::__2::allocator<char> >",
    "std::__2::u8string",
    "std::__2::basic_string<char8_t, std::__2::char_traits<char8_t>, std::__2::allocator<char8_t> >",
  ],
  format: formatLibCXX8String,
});

CustomFormatters.addFormatter({
  types: [
    "std::__2::u16string",
    "std::__2::basic_string<char16_t, std::__2::char_traits<char16_t>, std::__2::allocator<char16_t> >",
  ],
  format: formatLibCXX16String,
});

CustomFormatters.addFormatter({
  types: [
    "std::__2::wstring",
    "std::__2::basic_string<wchar_t, std::__2::char_traits<wchar_t>, std::__2::allocator<wchar_t> >",
    "std::__2::u32string",
    "std::__2::basic_string<char32_t, std::__2::char_traits<char32_t>, std::__2::allocator<char32_t> >",
  ],
  format: formatLibCXX32String,
});

// LOK: {
// String: {
type LLDBString = { size: number; string: string } | string;
function formatStringBuffer(
  wasm: WasmInterface,
  buffer: Value,
  length: number,
  encoding: string = "utf-8",
  bytesPerChar: number = 1,
): LLDBString {
  if (!buffer || buffer.asUint32() === 0 || length === 0) {
    return "";
  }

  const isLong = 0 < (length & 0x80);

  const charType =
    bytesPerChar === 2
      ? Uint16Array
      : bytesPerChar === 4
        ? Uint32Array
        : Uint8Array;

  if (isLong) {
    const data = buffer.asUint32();

    const copyLen = Math.min(length * bytesPerChar, Constants.MAX_STRING_LEN);
    const bytes = wasm.readMemory(data, copyLen);
    const text = new charType(bytes.buffer, bytes.byteOffset, length);
    return { size: length, string: new TextDecoder(encoding).decode(text) };
  }

  const bytes = buffer.asDataView(0, length * bytesPerChar);
  const text = new charType(bytes.buffer, bytes.byteOffset, length);
  return new TextDecoder(encoding).decode(text);
}

function formatRTLStringBase(
  wasm: WasmInterface,
  value: Value,
  encoding: string = "utf-8",
  bytesPerChar: number = 1,
): LLDBString {
  const buffer = value.$("buffer");
  const length = value.$("length").asUint32();
  return formatStringBuffer(wasm, buffer, length, encoding, bytesPerChar);
}

// Base RTL object string formatter
function formatRTLOStringBase(
  wasm: WasmInterface,
  value: Value,
  encoding: string = "utf-8",
  bytesPerChar: number = 1,
) {
  return value.$("pData");
}

// Specific RTL string formatters using the base implementations
function formatRTLString(wasm: WasmInterface, value: Value): LLDBString {
  return formatRTLStringBase(wasm, value);
}

function formatRTLUString(wasm: WasmInterface, value: Value): LLDBString {
  return formatRTLStringBase(wasm, value, "utf-16le", 2);
}

function formatRTLOString(wasm: WasmInterface, value: Value) {
  return formatRTLOStringBase(wasm, value);
}

function formatRTLOUString(wasm: WasmInterface, value: Value) {
  return formatRTLOStringBase(wasm, value, "utf-16", 2);
}

// Register the RTL string formatters with consolidated type lists
CustomFormatters.addFormatter({
  types: ["_rtl_String", "rtl::OStringBuffer"],
  format: formatRTLString,
});

CustomFormatters.addFormatter({
  types: ["_rtl_uString", "rtl::OUStringBuffer"],
  format: formatRTLUString,
});

CustomFormatters.addFormatter({
  types: reMatch(/^rtl::OString$/),
  format: formatRTLOString,
});

CustomFormatters.addFormatter({
  types: reMatch(/^rtl::OUString$/),
  format: formatRTLOUString,
});

CustomFormatters.addFormatter({
  types: ["rtl_uString *", "rtl_String *"],
  format: (wasm, value) => value.$("*"),
});
// String: }

// UNO: {
const enum TypeClass {
  VOID = 0,
  CHAR = 1,
  BOOLEAN = 2,
  BYTE = 3,
  SHORT = 4,
  UNSIGNED_SHORT = 5,
  LONG = 6,
  UNSIGNED_LONG = 7,
  HYPER = 8,
  UNSIGNED_HYPER = 9,
  FLOAT = 10,
  DOUBLE = 11,
  STRING = 12,
  TYPE = 13,
  ANY = 14,
  ENUM = 15,
  TYPEDEF = 16,
  STRUCT = 17,
  EXCEPTION = 19,
  SEQUENCE = 20,
  INTERFACE = 22,
  SERVICE = 23,
  MODULE = 24,
  INTERFACE_METHOD = 25,
  INTERFACE_ATTRIBUTE = 26,
  UNKNOWN = 27,
  PROPERTY = 28,
  CONSTANT = 29,
  CONSTANTS = 30,
  SINGLETON = 31,
}

const PRIMITIVE_TO_RESULT_VIEW: Record<number, (value: Value, wasm: WasmInterface) => FormatterResult> = {
  [TypeClass.CHAR]: (value) => String.fromCharCode(value.asInt8()),
  [TypeClass.BOOLEAN]: (value) => value.asUint8() !== 0,
  [TypeClass.BYTE]: (value) => String.fromCharCode(value.asUint8()),
  [TypeClass.SHORT]: (value) => value.asInt16(),
  [TypeClass.UNSIGNED_SHORT]: (value) => value.asUint16(),
  [TypeClass.LONG]: (value) => value.asInt32(),
  [TypeClass.UNSIGNED_LONG]: (value) => value.asUint32(),
  [TypeClass.HYPER]: (value) => value.asInt64(),
  [TypeClass.UNSIGNED_HYPER]: (value) => value.asUint64(),
  [TypeClass.FLOAT]: (value) => value.asFloat32(),
  [TypeClass.DOUBLE]: (value) => value.asFloat64(),
  [TypeClass.STRING]: (value, wasm) => {
    const strValue = value.castTo("rtl::OUString");
    return formatRTLOUString(wasm, strValue);
  },
};

// Mapping primitive UNO types to C++ types
const PRIMITIVE_TO_CPP: Record<number, string> = {
  [TypeClass.TYPE]: "com::sun::star::uno::Type",
  [TypeClass.ANY]: "com::sun::star::uno::Any",
};

// UNO to C++ type set
const UNO_TO_CPP = new Set([
  TypeClass.ENUM,
  TypeClass.STRUCT,
  TypeClass.EXCEPTION,
  TypeClass.INTERFACE,
]);

// Constants
const CSSU_TYPE = "com::sun::star::uno::Type";
const TYPE_DESC = "_typelib_TypeDescription";
const TYPE_DESCS = new Set([
  TYPE_DESC,
  "_typelib_CompoundTypeDescription",
  "_typelib_StructTypeDescription",
  "_typelib_IndirectTypeDescription",
  "_typelib_EnumTypeDescription",
  "_typelib_InterfaceMemberTypeDescription",
  "_typelib_InterfaceMethodTypeDescription",
  "_typelib_InterfaceAttributeTypeDescription",
  "_typelib_InterfaceTypeDescription",
]);
const TYPE_DESC_REF = "_typelib_TypeDescriptionReference";

class TypeEntry {
  constructor(
    public type_class: number,
    public uno_type: string,
    public cpp_type: string,
    public element_type?: TypeEntry,
  ) { }
}

// Cache for type resolution
const unresolved_type_cache = new Set<number>();
const resolved_type_cache = new Map<number, TypeEntry>();

function unoToCpp(uno: string): string {
  return uno.replace(/\./g, "::");
}

function resolveUnoType(value: Value, wasm: WasmInterface): TypeEntry | undefined {
  const address = value.location;
  if (unresolved_type_cache.has(address)) {
    return undefined;
  }

  if (resolved_type_cache.has(address)) {
    return resolved_type_cache.get(address);
  }

  let val = value;
  let typeNames = value.typeNames;

  if (typeNames.includes(CSSU_TYPE)) {
    const pValue = value.$("_pType");
    unresolved_type_cache.add(address);
    if (!pValue) {
      return undefined;
    }
    val = pValue.$("*");
  }

  while (typeNames.includes(TYPE_DESC_REF)) {
    const pValue = val.$("pType");
    if (!pValue) {
      return undefined;
    }
    val = pValue.$("*");
    typeNames = val.typeNames;
  }

  if (!val.typeNames.some((name) => TYPE_DESCS.has(name))) {
    unresolved_type_cache.add(address);
    return undefined;
  }

  let fullVal = val;
  if (!val.typeNames.includes(TYPE_DESC)) {
    while (val.$("aBase")) {
      val = val.$("aBase");
    }
  }

  const typeClass = val.$("eTypeClass").asUint32();
  const nameRef = val.$("pTypeName").$("*");
  const nameString = formatRTLUString(wasm, nameRef) as string;

  if (typeClass in PRIMITIVE_TO_CPP) {
    const entry = new TypeEntry(
      typeClass,
      nameString,
      PRIMITIVE_TO_CPP[typeClass],
    );
    resolved_type_cache.set(address, entry);
    return entry;
  } else if (UNO_TO_CPP.has(typeClass)) {
    const entry = new TypeEntry(
      typeClass,
      nameString,
      unoToCpp(nameString),
    );
    resolved_type_cache.set(address, entry);
    return entry;
  } else if (
    typeClass === TypeClass.INTERFACE_ATTRIBUTE ||
    typeClass === TypeClass.INTERFACE_METHOD
  ) {
    const [interface_, , member] = nameString.split("::");
    const entry = new TypeEntry(
      typeClass,
      nameString,
      `${unoToCpp(interface_)}::*${member}`,
    );
    resolved_type_cache.set(address, entry);
    return entry;
  } else if (typeClass === TypeClass.SEQUENCE) {
    const pElem = fullVal.$("pType").$("*");
    if (!pElem) {
      unresolved_type_cache.add(address);
      return undefined;
    }

    const elem = resolveUnoType(pElem, wasm);
    if (!elem) {
      unresolved_type_cache.add(address);
      return undefined;
    }

    const entry = new TypeEntry(
      typeClass,
      nameString,
      `com::sun::star::uno::Sequence<${elem.cpp_type}>`,
      elem,
    );
    resolved_type_cache.set(address, entry);
    return entry;
  }

  unresolved_type_cache.add(address);
  return undefined;
}

function formatUnoAny(wasm: WasmInterface, value: Value): FormatterResult {
  try {
  const typeDesc = value.$("pType");
  if (!typeDesc) {
    return undefined;
  }

  const typeClass = typeDesc.$("*").$("eTypeClass").asUint32();
  if (typeClass in PRIMITIVE_TO_RESULT_VIEW) {
    return PRIMITIVE_TO_RESULT_VIEW[typeClass](value.$("pData").$("*"), wasm);
  } else if (typeClass === TypeClass.VOID) {
    return undefined;
  }

  const type = resolveUnoType(typeDesc.$("*"), wasm);
  if (!type) {
    return undefined;
  }

  const ptr = value.$("pData");
  if (!ptr) {
    return undefined;
  }
  return ptr.castChildAtIndexTo(0, type.cpp_type);

  } catch (e) {
    console.error(e);
    return undefined;
  }
}

function unwrapTemplateTypeName(typeName: string): string {
  return typeName.replace(/^.*<([^>]+)>$/, '$1');
}

function formatUnoReference(
  wasm: WasmInterface,
  value: Value,
): Value | undefined {
  const iface = value.$("_pInterface");
  if (!iface) {
    return undefined;
  }

  return iface.$("*").castTo(unwrapTemplateTypeName(value.typeNames[0]));
}

function formatUnoSequence(wasm: WasmInterface, value: Value): Value[] {
  const ptr = value.$("_pSequence");
  if (!ptr) {
    return [];
  }

  const impl = ptr.$("*");
  const size = impl.$("nElements").asUint32();
  const elements = impl.$("elements");

  const result: Value[] = [];
  for (let i = 0; i < size; i++) {
    result.push(elements.$(i));
  }

  return result;
}

function formatUnoSequencePropertyValue(
  wasm: WasmInterface,
  value: Value,
): Record<string, Value> {
  const ptr = value.$("_pSequence");
  if (!ptr) {
    return {};
  }

  const impl = ptr.$("*");
  const size = impl.$("nElements").asUint32();
  const elements = impl.$("elements");

  const result: Record<string, Value> = {};
  for (let i = 0; i < size; i++) {
    const el = elements.castChildAtIndexTo(i, "com::sun::star::beans::PropertyValue");
    const nameRef = el.$("Name").$("pData").$("*");
    const nameString = formatRTLStringBase(
      wasm,
      nameRef,
      "utf-16le",
      2,
    ) as string;
    result[nameString] = el.$("Value");
  }

  return result;
}

function formatUnoType(wasm: WasmInterface, value: Value): Value | undefined {
  return resolveUnoType(value, wasm) ? value : undefined;
}

// Register formatters
CustomFormatters.addFormatter({
  types: reMatch(/^_uno_Any$/, /^com::sun::star::uno::Any$/),
  format: formatUnoAny,
});

CustomFormatters.addFormatter({
  types: reMatch(/^com::sun::star::uno::Reference<.+>$/),
  format: formatUnoReference,
});

// special case for map-like
CustomFormatters.addFormatter({
  types: reMatch(
    /^com::sun::star::uno::Sequence<com::sun::star::beans::PropertyValue>$/,
  ),
  format: formatUnoSequencePropertyValue,
});

CustomFormatters.addFormatter({
  types: reMatch(/^com::sun::star::uno::Sequence<.+>$/),
  format: formatUnoSequence,
});

CustomFormatters.addFormatter({
  types: reMatch(/^com::sun::star::uno::Type$/),
  format: formatUnoType,
});
// UNO: }

// LOK: }

type CharArrayConstructor =
  | typeof Uint8Array
  | typeof Uint16Array
  | typeof Uint32Array;
function formatRawString<T extends CharArrayConstructor>(
  wasm: WasmInterface,
  value: Value,
  charType: T,
  decode: (chars: InstanceType<T>) => string,
):
  | string
  | {
    [key: string]: Value | null;
  } {
  const address = value.asUint32();
  if (address < Constants.SAFE_HEAP_START) {
    return formatPointerOrReference(wasm, value);
  }
  const charSize = charType.BYTES_PER_ELEMENT;
  const slices: DataView[] = [];
  const deref = value.$("*");
  for (
    let bufferSize = 0;
    bufferSize < Constants.MAX_STRING_LEN;
    bufferSize += Constants.PAGE_SIZE
  ) {
    // Copy PAGE_SIZE bytes
    const buffer = deref.asDataView(bufferSize, Constants.PAGE_SIZE);
    // Convert to charType
    const substr = new charType(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength / charSize,
    );
    const strlen = substr.indexOf(0);
    if (strlen >= 0) {
      // buffer size is in bytes, strlen in characters
      const str = new charType(
        bufferSize / charSize + strlen,
      ) as InstanceType<T>;
      for (let i = 0; i < slices.length; ++i) {
        str.set(
          new charType(
            slices[i].buffer,
            slices[i].byteOffset,
            slices[i].byteLength / charSize,
          ),
          (i * Constants.PAGE_SIZE) / charSize,
        );
      }
      str.set(substr.subarray(0, strlen), bufferSize / charSize);
      return decode(str);
    }
    slices.push(buffer);
  }
  return formatPointerOrReference(wasm, value);
}

export function formatCString(
  wasm: WasmInterface,
  value: Value,
):
  | string
  | {
    [key: string]: Value | null;
  } {
  return formatRawString(wasm, value, Uint8Array, (str) =>
    new TextDecoder().decode(str),
  );
}

export function formatU16CString(
  wasm: WasmInterface,
  value: Value,
):
  | string
  | {
    [key: string]: Value | null;
  } {
  return formatRawString(wasm, value, Uint16Array, (str) =>
    new TextDecoder("utf-16le").decode(str),
  );
}

export function formatCWString(
  wasm: WasmInterface,
  value: Value,
):
  | string
  | {
    [key: string]: Value | null;
  } {
  // emscripten's wchar is 4 byte
  return formatRawString(wasm, value, Uint32Array, (str) =>
    Array.from(str)
      .map((v) => String.fromCodePoint(v))
      .join(""),
  );
}

// Register with higher precedence than the generic pointer handler.
CustomFormatters.addFormatter({
  types: ["char *", "char8_t *"],
  format: formatCString,
});
CustomFormatters.addFormatter({
  types: ["char16_t *"],
  format: formatU16CString,
});
CustomFormatters.addFormatter({
  types: ["wchar_t *", "char32_t *"],
  format: formatCWString,
});

export function formatVector(wasm: WasmInterface, value: Value): Value[] {
  const begin = value.$("__begin_");
  const end = value.$("__end_");
  const size = (end.asUint32() - begin.asUint32()) / begin.$("*").size;
  const elements = [];
  for (let i = 0; i < size; ++i) {
    elements.push(begin.$(i));
  }
  return elements;
}

function reMatch(...exprs: RegExp[]): (type: TypeInfo) => boolean {
  return (type: TypeInfo) => {
    for (const expr of exprs) {
      for (const name of type.typeNames) {
        if (expr.exec(name)) {
          return true;
        }
      }
    }

    for (const expr of exprs) {
      for (const name of type.typeNames) {
        if (name.startsWith("const ")) {
          if (expr.exec(name.substring(6))) {
            return true;
          }
        }
      }
    }
    return false;
  };
}

CustomFormatters.addFormatter({
  types: reMatch(/^std::vector<.+>$/),
  format: formatVector,
});

export function formatPointerOrReference(
  wasm: WasmInterface,
  value: Value,
): { [key: string]: Value | null } {
  const address = value.asUint32();
  if (address === 0) {
    return { "0x0": null };
  }
  return { [`0x${address.toString(16)}`]: value.$("*") };
}
CustomFormatters.addFormatter({
  types: (type) => type.isPointer,
  format: formatPointerOrReference,
});

export function formatDynamicArray(
  wasm: WasmInterface,
  value: Value,
): { [key: string]: Value | null } {
  return { [`0x${value.location.toString(16)}`]: value.$(0) };
}
CustomFormatters.addFormatter({
  types: reMatch(/^.+\[\]$/),
  format: formatDynamicArray,
});

export function formatUInt128(wasm: WasmInterface, value: Value): bigint {
  const view = value.asDataView();
  return (
    (view.getBigUint64(8, true) << BigInt(64)) + view.getBigUint64(0, true)
  );
}
CustomFormatters.addFormatter({
  types: ["unsigned __int128"],
  format: formatUInt128,
});

export function formatInt128(wasm: WasmInterface, value: Value): bigint {
  const view = value.asDataView();
  return (view.getBigInt64(8, true) << BigInt(64)) | view.getBigUint64(0, true);
}
CustomFormatters.addFormatter({ types: ["__int128"], format: formatInt128 });

export function formatExternRef(
  wasm: WasmInterface,
  value: Value,
): () => LazyObject {
  const obj = {
    async getProperties(): Promise<{ name: string; property: LazyObject }[]> {
      return [];
    },
    async asRemoteObject(): Promise<ForeignObject> {
      const encodedValue = value.asUint64();
      const ValueClasses: ["global", "local", "operand"] = [
        "global",
        "local",
        "operand",
      ];
      const valueClass = ValueClasses[Number(encodedValue >> 32n)];
      return {
        type: "reftype",
        valueClass,
        index: Number(BigInt.asUintN(32, encodedValue)),
      };
    },
  };
  return () => obj;
}
CustomFormatters.addFormatter({
  types: ["__externref_t", "externref_t"],
  format: formatExternRef,
});

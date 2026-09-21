package io.github.neil1031.dashboard;

public class CollectionException extends RuntimeException {
    private final String code;
    public CollectionException(String code, String message) { super(message); this.code = code; }
    public String code() { return code; }
}

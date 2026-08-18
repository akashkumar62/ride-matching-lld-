package com.ridematching.location.exception;

import com.ridematching.common.response.ApiResponse;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(RuntimeException.class)
    public ApiResponse<String> handle(RuntimeException ex) {

        return ApiResponse.failure(ex.getMessage());
    }

}

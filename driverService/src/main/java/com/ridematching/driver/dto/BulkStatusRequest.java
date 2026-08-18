package com.ridematching.driver.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record BulkStatusRequest(

        @NotEmpty
        List<String> emails

) {
}

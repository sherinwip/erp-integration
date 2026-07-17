package com.technomile.erpconfigapi.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class PipelineStepDtos {
    public record PipelineStepCreateDto(
            @NotBlank @Size(max = 100) String pipeline_id,
            @NotNull Long step_pk,
            @NotNull @Min(1) Integer seq
    ) {
    }

    public record PipelineStepUpdateDto(
            @Min(1) Integer seq
    ) {
    }

    public record PipelineStepReadDto(
            Long pipeline_step_pk,
            String pipeline_id,
            Long step_pk,
            Integer seq
    ) {
    }
}
